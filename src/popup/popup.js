(() => {
  "use strict";

  const {
    ACTIONS,
    BUILD_ID,
    STORAGE_KEY,
    defaultSettings,
    localizeDocument,
    mergeSettings,
    runtimeIdentity,
    runtimeIdentitiesEqual,
    shortcutLabel,
    t
  } = globalThis.ViewTune;
  localizeDocument();
  const currentRuntime = runtimeIdentity(chrome.runtime);
  const STEP_ACTION_LABELS = Object.freeze({
    [ACTIONS.SPEED_DOWN]: t("popupSpeedDownAria", undefined, "재생 속도 0.5배 낮추기"),
    [ACTIONS.SPEED_UP]: t("popupSpeedUpAria", undefined, "재생 속도 0.5배 높이기")
  });
  const PENDING_REFRESH_MS = 80;
  const ACTIVE_WINDOW_REFRESH_MS = 500;

  const state = {
    settings: defaultSettings(),
    tabId: null,
    busy: false,
    hasVideo: false,
    requestRevision: 0,
    refreshTimer: null
  };

  const elements = {
    controls: document.querySelector("#controls"),
    installedVersion: document.querySelector("#installed-version"),
    openOptions: document.querySelector("#open-options"),
    rate: document.querySelector("#rate"),
    reloadTab: document.querySelector("#reload-tab"),
    runtime: document.querySelector("#runtime"),
    status: document.querySelector("#status"),
    targetRateLabel: document.querySelector("#target-rate-label"),
    actionButtons: [...document.querySelectorAll("[data-action]")],
    layoutButtons: [...document.querySelectorAll("[data-mode]")],
    shortcutTargets: [...document.querySelectorAll("[data-shortcut-for]")]
  };

  initialize();

  async function initialize() {
    bindEvents();
    setControlsEnabled(false);
    renderInstalledVersion();
    renderRuntime();
    await loadSettings();
    renderShortcutLabels();
    await refreshStatus();
  }

  function renderInstalledVersion() {
    const version = currentRuntime.manifestVersion || "—";
    elements.installedVersion.textContent = `v${version}`;
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (actionButton) {
        executeAction(actionButton.dataset.action);
      }
    });

    elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
    elements.reloadTab.addEventListener("click", reloadActiveTab);
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEY);
      state.settings = mergeSettings(stored[STORAGE_KEY]);
    } catch {
      state.settings = defaultSettings();
    }
  }

  async function refreshStatus(requestRevision = beginRequest()) {
    try {
      const tab = await activeTab();
      if (!isCurrentRequest(requestRevision)) {
        return;
      }
      state.tabId = tab?.id ?? null;
      if (!Number.isInteger(state.tabId)) {
        renderDisconnected(t("popupNoActiveTab", undefined, "현재 탭을 확인할 수 없어요."));
        return;
      }

      const result = await chrome.runtime.sendMessage({
        type: "viewtune/tab-status",
        tabId: state.tabId
      });
      if (!isCurrentRequest(requestRevision)) {
        return;
      }
      renderResult(result);
      scheduleStatusRefresh(result, requestRevision);
    } catch {
      if (isCurrentRequest(requestRevision)) {
        renderDisconnected(t("popupUnavailable", undefined, "이 탭에서는 ViewTune을 사용할 수 없어요."));
      }
    }
  }

  async function executeAction(action) {
    if (state.busy || !Number.isInteger(state.tabId)) {
      return;
    }

    const requestRevision = beginRequest();
    setBusy(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "viewtune/tab-command",
        tabId: state.tabId,
        action
      });
      if (!isCurrentRequest(requestRevision)) {
        return;
      }
      renderResult(result);
      scheduleStatusRefresh(result, requestRevision);
    } catch {
      if (isCurrentRequest(requestRevision)) {
        renderDisconnected(t(
          "popupCommandFailed",
          undefined,
          "명령을 전달하지 못했어요. 페이지를 새로고침해 보세요."
        ));
      }
    } finally {
      if (isCurrentRequest(requestRevision)) {
        setBusy(false);
      }
    }
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
  }

  function renderResult(result) {
    if (result?.receiverMissing) {
      renderDisconnected(result.message);
      return;
    }

    if (!isCurrentRuntime(result?.runtime)) {
      renderStaleRuntime(result?.runtime);
      return;
    }

    renderRuntime(result.runtime);
    elements.reloadTab.hidden = true;
    if (!result?.found) {
      renderDisconnected(result?.message || t(
        "popupNoVideo",
        undefined,
        "현재 탭에서 제어할 영상을 찾지 못했어요."
      ));
      return;
    }

    const actionFailed = result.ok === false && result.message;
    state.hasVideo = true;
    elements.status.textContent = actionFailed
      ? result.message
      : t("popupConnected", undefined, "현재 영상에 연결됨");
    if (actionFailed) {
      delete elements.status.dataset.connected;
    } else {
      elements.status.dataset.connected = "true";
    }
    elements.rate.textContent = `${formatRate(result.rate)}×`;
    setControlsEnabled(true);
    renderModes(result.modes);
  }

  function renderDisconnected(message) {
    state.hasVideo = false;
    elements.status.textContent = message;
    delete elements.status.dataset.connected;
    elements.rate.textContent = "—";
    elements.reloadTab.hidden = true;
    renderRuntime();
    setControlsEnabled(false);
    renderModes();
  }

  function setControlsEnabled(enabled) {
    elements.controls.setAttribute("aria-disabled", String(!enabled));
    for (const button of elements.actionButtons) {
      button.disabled = !enabled || state.busy;
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.controls.setAttribute("aria-busy", String(busy));
    setControlsEnabled(state.hasVideo);
  }

  function renderShortcutLabels() {
    for (const target of elements.shortcutTargets) {
      target.textContent = shortcutLabel(state.settings.shortcuts[target.dataset.shortcutFor]);
    }
    for (const [action, label] of Object.entries(STEP_ACTION_LABELS)) {
      const button = elements.actionButtons.find((candidate) => candidate.dataset.action === action);
      button?.setAttribute(
        "aria-label",
        t(
          "popupActionShortcutAria",
          [label, shortcutLabel(state.settings.shortcuts[action])],
          `${label}, 단축키 ${shortcutLabel(state.settings.shortcuts[action])}`
        )
      );
    }
    const targetRate = formatRate(state.settings.targetPlaybackRate);
    elements.targetRateLabel.textContent = t(
      "popupApplyTargetRate",
      [targetRate],
      `${targetRate}× 바로 적용`
    );
    const targetButton = elements.actionButtons.find(
      (candidate) => candidate.dataset.action === ACTIONS.SPEED_TARGET
    );
    targetButton?.setAttribute("aria-label", t(
      "popupApplyTargetRateAria",
      [targetRate, shortcutLabel(state.settings.shortcuts[ACTIONS.SPEED_TARGET])],
      `목표 속도 ${targetRate}배 적용, 단축키 ${shortcutLabel(state.settings.shortcuts[ACTIONS.SPEED_TARGET])}`
    ));
  }

  function renderStaleRuntime(pageRuntime) {
    state.hasVideo = false;
    elements.status.textContent = t(
      "popupUpdateRequired",
      undefined,
      "업데이트 적용 필요 — 이 탭은 이전 ViewTune 코드입니다."
    );
    delete elements.status.dataset.connected;
    elements.rate.textContent = "—";
    elements.reloadTab.hidden = false;
    renderRuntime(pageRuntime);
    setControlsEnabled(false);
    renderModes();
  }

  function isCurrentRuntime(runtime) {
    return runtimeIdentitiesEqual(runtime, currentRuntime);
  }

  function renderRuntime(pageRuntime) {
    const expected = t(
      "popupRuntimeExpected",
      [currentRuntime.manifestVersion || "?", BUILD_ID],
      `확장 v${currentRuntime.manifestVersion} · ${BUILD_ID}`
    );
    elements.runtime.hidden = true;
    elements.runtime.textContent = "";
    elements.runtime.title = expected;
    if (!pageRuntime || isCurrentRuntime(pageRuntime)) {
      return;
    }

    const pageVersion = pageRuntime.manifestVersion
      ? `v${pageRuntime.manifestVersion}`
      : t("popupNoVersion", undefined, "버전 정보 없음");
    const pageBuild = pageRuntime.buildId || t("popupNoBuild", undefined, "빌드 정보 없음");
    const differentExtension = pageRuntime.extensionId
      && pageRuntime.extensionId !== currentRuntime.extensionId
      ? t("popupDifferentExtension", undefined, " · 다른 확장 ID")
      : "";
    elements.runtime.textContent = t(
      "popupRuntimeMismatch",
      [expected, pageVersion, pageBuild, differentExtension],
      `${expected} · 페이지 ${pageVersion} · ${pageBuild}${differentExtension}`
    );
    elements.runtime.title = elements.runtime.textContent;
    elements.runtime.hidden = false;
  }

  function renderModes(modes = {}) {
    for (const button of elements.layoutButtons) {
      const active = modes[button.dataset.mode] === true;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function beginRequest() {
    state.requestRevision += 1;
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
    return state.requestRevision;
  }

  function isCurrentRequest(requestRevision) {
    return requestRevision === state.requestRevision;
  }

  function scheduleStatusRefresh(result, requestRevision) {
    const delay = nextStatusRefreshDelay(result);
    if (delay === null) {
      return;
    }

    clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = null;
      if (isCurrentRequest(requestRevision)) {
        void refreshStatus(requestRevision);
      }
    }, delay);
  }

  function nextStatusRefreshDelay(result) {
    if (!result?.found || !isCurrentRuntime(result.runtime)) {
      return null;
    }
    if (result.pendingModes?.[ACTIONS.WINDOW]) {
      return PENDING_REFRESH_MS;
    }
    return result.modes?.[ACTIONS.WINDOW] ? ACTIVE_WINDOW_REFRESH_MS : null;
  }

  async function reloadActiveTab() {
    if (!Number.isInteger(state.tabId)) {
      return;
    }
    elements.reloadTab.disabled = true;
    try {
      await chrome.tabs.reload(state.tabId);
      window.close();
    } catch {
      elements.reloadTab.disabled = false;
      elements.status.textContent = t("popupReloadFailed", undefined, "탭을 새로고침하지 못했어요.");
    }
  }

  function formatRate(rate) {
    if (!Number.isFinite(rate)) {
      return "—";
    }
    return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
})();
