"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const popupSource = readFileSync(path.join(__dirname, "../src/popup/popup.js"), "utf8");
const settingsSource = readFileSync(path.join(__dirname, "../src/popup/settings-panel.js"), "utf8");
const ACTIONS = ["wide", "window", "speedTarget", "speedDown", "speedUp", "speedReset"];

class FakeElement {
  constructor({ dataset = {}, disabled = false, hidden = false, kbd = null } = {}) {
    this.attributes = new Map();
    this.checked = false;
    this.dataset = { ...dataset };
    this.disabled = disabled;
    this.hidden = hidden;
    this.kbd = kbd;
    this.listeners = new Map();
    this.textContent = "";
    this.title = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    return selector === "kbd" ? this.kbd : null;
  }

  closest(selector) {
    if (selector === "[data-action]" && this.dataset.action) return this;
    if (selector === "[data-record-action]" && this.dataset.recordAction) return this;
    if (selector === "[data-setting-action]" && this.dataset.settingAction) return this;
    return null;
  }
}

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

function defaultSettings() {
  const codes = {
    wide: "KeyB",
    window: "KeyV",
    speedTarget: "KeyG",
    speedDown: "BracketLeft",
    speedUp: "BracketRight",
    speedReset: "KeyR"
  };
  return {
    showFeedback: true,
    targetPlaybackRate: 2,
    shortcuts: Object.fromEntries(ACTIONS.map((action) => [action, { code: codes[action] }]))
  };
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

function createPopupHarness(messageHandler) {
  const runtime = { buildId: "test-build", extensionId: "test-extension", manifestVersion: "1.0.0" };
  const elements = {
    controlView: new FakeElement(),
    controls: new FakeElement(),
    installedVersion: new FakeElement(),
    panel: new FakeElement(),
    rate: new FakeElement(),
    reloadTab: new FakeElement(),
    runtimeText: new FakeElement(),
    settingsToggle: new FakeElement(),
    settingsView: new FakeElement({ hidden: true }),
    status: new FakeElement(),
    targetRateLabel: new FakeElement()
  };
  const actionButtons = ACTIONS.map((action) => new FakeElement({
    dataset: {
      action,
      ...(action === "wide" || action === "window" ? { mode: action } : {})
    }
  }));
  const windowButton = actionButtons.find((button) => button.dataset.action === "window");
  const documentListeners = new Map();
  const timers = [];
  let settingsController;

  const document = {
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    querySelector(selector) {
      return {
        "#control-view": elements.controlView,
        "#controls": elements.controls,
        "#installed-version": elements.installedVersion,
        ".panel": elements.panel,
        "#rate": elements.rate,
        "#reload-tab": elements.reloadTab,
        "#runtime": elements.runtimeText,
        "#toggle-settings": elements.settingsToggle,
        "#settings-view": elements.settingsView,
        "#status": elements.status,
        "#target-rate-label": elements.targetRateLabel
      }[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-action]") return actionButtons;
      if (selector === "[data-mode]") return actionButtons.filter((button) => button.dataset.mode);
      if (selector === "[data-shortcut-for]") return [];
      return [];
    }
  };

  class PopupSettingsController {
    constructor({ onChange }) {
      this.onChange = onChange;
      this.cancelCount = 0;
      settingsController = this;
    }
    async initialize() {
      const settings = defaultSettings();
      this.onChange(settings);
      return settings;
    }
    cancelRecording() { this.cancelCount += 1; }
  }

  const context = {
    chrome: {
      runtime: {
        id: runtime.extensionId,
        sendMessage(message) { return messageHandler(message, runtime); }
      },
      tabs: {
        async query() { return [{ id: 7 }]; },
        async reload() {}
      }
    },
    clearTimeout() {},
    document,
    window: {
      close() {},
      setTimeout(callback, delay) {
        timers.push({ callback, delay });
        return timers.length;
      }
    },
    ViewTune: {
      ACTION_LABELS: Object.fromEntries(ACTIONS.map((action) => [action, action])),
      ACTIONS: {
        WIDE: "wide",
        WINDOW: "window",
        SPEED_DOWN: "speedDown",
        SPEED_UP: "speedUp",
        SPEED_TARGET: "speedTarget",
        SPEED_RESET: "speedReset"
      },
      BUILD_ID: runtime.buildId,
      PopupSettingsController,
      defaultSettings,
      localizeDocument() {},
      runtimeIdentity: () => runtime,
      runtimeIdentitiesEqual: (left, right) => (
        left?.buildId === right?.buildId
        && left?.extensionId === right?.extensionId
        && left?.manifestVersion === right?.manifestVersion
      ),
      shortcutLabel: (shortcut) => shortcut?.code || "—",
      t: (_key, _substitutions, fallback) => fallback
    }
  };

  vm.runInNewContext(popupSource, context, { filename: "popup.js" });
  return { actionButtons, documentListeners, elements, runtime, settingsController, timers, windowButton };
}

test("popup은 설치 버전을 표시하고 같은 셸에서 설정 화면을 교체한다", async () => {
  const harness = createPopupHarness((_message, runtime) => currentVideoResult(runtime, false, false));
  await flushAsync();

  assert.equal(harness.elements.installedVersion.textContent, "v1.0.0");
  assert.equal(harness.elements.controlView.hidden, false);
  assert.equal(harness.elements.settingsView.hidden, true);

  harness.elements.settingsToggle.listeners.get("click")();
  assert.equal(harness.elements.controlView.hidden, true);
  assert.equal(harness.elements.settingsView.hidden, false);
  assert.equal(harness.elements.settingsToggle.getAttribute("aria-pressed"), "true");

  harness.elements.settingsToggle.listeners.get("click")();
  assert.equal(harness.settingsController.cancelCount, 1);
  assert.equal(harness.elements.controlView.hidden, false);
});

test("V 지연 검증이 원복되면 popup의 활성 상태도 최신 status로 돌아온다", async () => {
  const harness = createPopupHarness((message, runtime) => (
    message.type === "viewtune/tab-command"
      ? currentVideoResult(runtime, true, true)
      : currentVideoResult(runtime, false, false)
  ));
  await flushAsync();
  await flushAsync();

  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "false");
  harness.documentListeners.get("click")({ target: harness.windowButton });
  await flushAsync();
  await flushAsync();

  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "true");
  assert.equal(harness.timers[0].delay, 80);
  harness.timers.shift().callback();
  await flushAsync();
  await flushAsync();

  assert.equal(harness.windowButton.dataset.active, "false");
  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "false");
});

test("진행 중이던 status 응답은 더 최신 popup 명령 상태를 덮지 않는다", async () => {
  let resolveStaleStatus;
  const staleStatus = new Promise((resolve) => { resolveStaleStatus = resolve; });
  let statusCalls = 0;
  let commandCalls = 0;
  const harness = createPopupHarness((message, runtime) => {
    if (message.type === "viewtune/tab-status") {
      statusCalls += 1;
      return statusCalls === 1 ? currentVideoResult(runtime, false, false) : staleStatus;
    }
    commandCalls += 1;
    return commandCalls === 1
      ? currentVideoResult(runtime, true, true)
      : currentVideoResult(runtime, false, false);
  });
  await flushAsync();
  await flushAsync();

  harness.documentListeners.get("click")({ target: harness.windowButton });
  await flushAsync();
  await flushAsync();
  harness.timers.shift().callback();
  await flushAsync();
  assert.equal(statusCalls, 2);

  harness.documentListeners.get("click")({ target: harness.windowButton });
  await flushAsync();
  await flushAsync();
  resolveStaleStatus(currentVideoResult(harness.runtime, true, false));
  await flushAsync();
  await flushAsync();

  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "false");
});

test("통합 설정은 로드 전 입력을 막고 키·목표 속도·피드백·복원을 같은 저장 계약으로 처리한다", async () => {
  let resolveStoredSettings;
  const storedSettings = new Promise((resolve) => { resolveStoredSettings = resolve; });
  const saved = [];
  const documentListeners = new Map();
  const panel = new FakeElement();
  const feedback = new FakeElement({ disabled: true });
  const note = new FakeElement();
  const restore = new FakeElement({ disabled: true });
  const targetDown = new FakeElement({ dataset: { settingAction: "targetDown" }, disabled: true });
  const targetUp = new FakeElement({ dataset: { settingAction: "targetUp" }, disabled: true });
  const targetRate = new FakeElement();
  const shortcutButtons = ACTIONS.map((action) => new FakeElement({
    dataset: { recordAction: action },
    disabled: true,
    kbd: new FakeElement()
  }));
  const custom = defaultSettings();
  custom.showFeedback = false;
  custom.targetPlaybackRate = 2.5;

  const document = {
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    querySelector(selector) {
      return {
        "#show-feedback": feedback,
        "#settings-note": note,
        "#settings-view": panel,
        "#restore-defaults": restore,
        "#target-playback-rate": targetRate
      }[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-setting-action]") return [targetDown, targetUp];
      if (selector === "[data-record-action]") return shortcutButtons;
      return [];
    }
  };
  const normalizeShortcut = (shortcut) => shortcut && ({
    code: shortcut.code,
    shift: Boolean(shortcut.shift),
    alt: Boolean(shortcut.alt),
    ctrl: Boolean(shortcut.ctrl),
    meta: Boolean(shortcut.meta)
  });
  const context = {
    chrome: { storage: { sync: {} } },
    clearTimeout() {},
    document,
    setTimeout() { return 1; },
    ViewTune: {
      ACTION_LABELS: Object.fromEntries(ACTIONS.map((action) => [action, action])),
      ACTION_ORDER: ACTIONS,
      STORAGE_KEY: "viewTuneSettings",
      defaultSettings,
      loadSettingsFromStorage: async () => cloneSettings(await storedSettings),
      mergeSettings: cloneSettings,
      normalizeTargetPlaybackRate: (rate) => Math.round(Math.max(0.5, Math.min(4, rate)) * 100) / 100,
      shortcutFromEvent: (event) => normalizeShortcut({
        code: event.code,
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey
      }),
      shortcutLabel: (shortcut) => shortcut?.code?.replace(/^Key/, "") || "—",
      shortcutsEqual: (left, right) => JSON.stringify(normalizeShortcut(left)) === JSON.stringify(normalizeShortcut(right)),
      t: (_key, _substitutions, fallback) => fallback
    }
  };

  vm.runInNewContext(settingsSource, context, { filename: "settings-panel.js" });
  const controller = new context.ViewTune.PopupSettingsController({
    documentRef: document,
    storageArea: {
      async set(value) { saved.push(cloneSettings(value.viewTuneSettings)); }
    }
  });
  const initialization = controller.initialize();
  assert.equal(documentListeners.has("click"), false);
  assert.equal(shortcutButtons.every((button) => button.disabled), true);

  resolveStoredSettings(custom);
  await initialization;
  assert.equal(documentListeners.has("click"), true);
  assert.equal(shortcutButtons.every((button) => !button.disabled), true);
  assert.equal(targetRate.textContent, "2.5×");
  assert.equal(feedback.checked, false);

  documentListeners.get("click")({ target: targetUp });
  await flushAsync();
  await flushAsync();
  assert.equal(targetRate.textContent, "2.75×");

  documentListeners.get("click")({ target: shortcutButtons[0] });
  await documentListeners.get("keydown")({
    code: "KeyQ",
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(shortcutButtons[0].kbd.textContent, "Q");

  feedback.checked = true;
  await feedback.listeners.get("change")();
  assert.equal(feedback.checked, true);

  await restore.listeners.get("click")();
  assert.equal(targetRate.textContent, "2×");
  assert.equal(shortcutButtons[0].kbd.textContent, "B");
  assert.equal(saved.length, 4);
});

function currentVideoResult(runtime, windowActive, windowPending) {
  return {
    supported: true,
    found: true,
    ok: true,
    rate: 1,
    modes: { wide: false, window: windowActive },
    pendingModes: { wide: false, window: windowPending },
    runtime
  };
}
