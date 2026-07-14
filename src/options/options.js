(() => {
  "use strict";

  const {
    ACTION_LABELS,
    ACTION_ORDER,
    STORAGE_KEY,
    defaultSettings,
    loadSettingsFromStorage,
    shortcutFromEvent,
    shortcutLabel,
    shortcutsEqual
  } = globalThis.ViewTune;

  let settings = defaultSettings();
  let recordingAction = null;
  let noteTimer = null;
  const DEFAULT_NOTE = "키 버튼을 선택하면 새 단축키를 입력할 수 있습니다.";

  const elements = {
    feedback: document.querySelector("#show-feedback"),
    main: document.querySelector("main"),
    note: document.querySelector("#recording-note"),
    restoreDefaults: document.querySelector("#restore-defaults"),
    shortcutButtons: [...document.querySelectorAll("[data-record-action]")]
  };

  initialize();

  async function initialize() {
    await loadSettings();
    render();
    bindEvents();
    setInteractive(true);
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-record-action]");
      if (button) {
        startRecording(button.dataset.recordAction);
      }
    });

    document.addEventListener("keydown", captureShortcut, true);
    elements.restoreDefaults.addEventListener("click", restoreDefaults);
    elements.feedback.addEventListener("change", updateFeedbackPreference);
  }

  async function loadSettings() {
    try {
      settings = await loadSettingsFromStorage(chrome.storage.sync, { migrate: true });
    } catch {
      settings = defaultSettings();
      showNote("설정을 읽지 못해 기본값을 사용 중입니다.", "error");
    }
  }

  function render() {
    for (const button of elements.shortcutButtons) {
      const action = button.dataset.recordAction;
      button.querySelector("kbd").textContent = recordingAction === action
        ? "키를 누르세요…"
        : shortcutLabel(settings.shortcuts[action]);
      button.dataset.recording = String(recordingAction === action);
      button.setAttribute("aria-pressed", String(recordingAction === action));
      button.setAttribute(
        "aria-label",
        `${ACTION_LABELS[action]} 단축키 변경, 현재 ${shortcutLabel(settings.shortcuts[action])}`
      );
    }
    elements.feedback.checked = settings.showFeedback;
  }

  function setInteractive(enabled) {
    elements.main.setAttribute("aria-busy", String(!enabled));
    elements.feedback.disabled = !enabled;
    elements.restoreDefaults.disabled = !enabled;
    for (const button of elements.shortcutButtons) {
      button.disabled = !enabled;
    }
  }

  function startRecording(action) {
    recordingAction = recordingAction === action ? null : action;
    render();
    if (recordingAction) {
      showNote("원하는 키 또는 Shift + 키를 누르세요. Esc는 취소합니다.");
    } else {
      showNote("변경을 취소했습니다.");
    }
  }

  async function captureShortcut(event) {
    if (!recordingAction) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.code === "Escape") {
      recordingAction = null;
      render();
      showNote("변경을 취소했습니다.");
      return;
    }

    const shortcut = shortcutFromEvent(event);
    if (!shortcut) {
      showNote("수정 키만으로는 단축키를 만들 수 없어요.", "error");
      return;
    }
    if (shortcut.ctrl || shortcut.alt || shortcut.meta) {
      showNote("Ctrl, Alt, Meta 조합은 브라우저 단축키와 충돌할 수 있어 사용할 수 없어요.", "error");
      return;
    }

    const conflictAction = conflictingAction(shortcut);
    if (conflictAction) {
      showNote(`${ACTION_LABELS[conflictAction]}에 이미 같은 키가 지정되어 있어요.`, "error");
      return;
    }

    const action = recordingAction;
    const previous = settings.shortcuts[action];
    settings.shortcuts[action] = shortcut;
    recordingAction = null;
    render();

    try {
      await saveSettings();
      showNote(`${ACTION_LABELS[action]}: ${shortcutLabel(shortcut)}로 저장했습니다.`, "success");
    } catch {
      settings.shortcuts[action] = previous;
      render();
      showNote("저장하지 못했습니다. 다시 시도해 주세요.", "error");
    }
  }

  function conflictingAction(shortcut) {
    return ACTION_ORDER.find(
      (action) => action !== recordingAction && shortcutsEqual(settings.shortcuts[action], shortcut)
    );
  }

  async function restoreDefaults() {
    recordingAction = null;
    settings = defaultSettings();
    render();
    try {
      await saveSettings();
      showNote("기본 단축키와 피드백 설정을 복원했습니다.", "success");
    } catch {
      await loadSettings();
      render();
      showNote("복원 설정을 저장하지 못했습니다.", "error");
    }
  }

  async function updateFeedbackPreference() {
    const previous = settings.showFeedback;
    settings.showFeedback = elements.feedback.checked;
    try {
      await saveSettings();
      showNote(settings.showFeedback ? "화면 피드백을 표시합니다." : "화면 피드백을 숨깁니다.", "success");
    } catch {
      settings.showFeedback = previous;
      render();
      showNote("설정을 저장하지 못했습니다.", "error");
    }
  }

  function saveSettings() {
    return chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }

  function showNote(message, tone = "default") {
    clearTimeout(noteTimer);
    elements.note.textContent = message;
    if (tone === "default") {
      delete elements.note.dataset.tone;
    } else {
      elements.note.dataset.tone = tone;
    }
    if (tone !== "default") {
      noteTimer = setTimeout(() => {
        elements.note.textContent = DEFAULT_NOTE;
        delete elements.note.dataset.tone;
      }, 3000);
    }
  }
})();
