(() => {
  "use strict";

  const {
    ACTION_LABELS,
    ACTION_ORDER,
    STORAGE_KEY,
    defaultSettings,
    loadSettingsFromStorage,
    mergeSettings,
    normalizeTargetPlaybackRate,
    shortcutFromEvent,
    shortcutLabel,
    shortcutsEqual,
    t
  } = globalThis.ViewTune;
  const TARGET_RATE_STEP = 0.25;
  const NOTE_DURATION_MS = 2200;

  class PopupSettingsController {
    constructor({
      documentRef = document,
      storageArea = chrome.storage.sync,
      onChange = () => {}
    } = {}) {
      this.document = documentRef;
      this.storageArea = storageArea;
      this.onChange = onChange;
      this.settings = defaultSettings();
      this.recordingAction = null;
      this.noteTimer = null;
      this.saving = false;
      this.captureShortcut = this.captureShortcut.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.updateFeedback = this.updateFeedback.bind(this);
      this.elements = {
        feedback: documentRef.querySelector("#show-feedback"),
        feedbackToggle: documentRef.querySelector(".feedback-toggle"),
        note: documentRef.querySelector("#settings-note"),
        panel: documentRef.querySelector("#settings-view"),
        restoreDefaults: documentRef.querySelector("#restore-defaults"),
        settingButtons: [...documentRef.querySelectorAll("[data-setting-action]")],
        shortcutButtons: [...documentRef.querySelectorAll("[data-record-action]")],
        targetRate: documentRef.querySelector("#target-playback-rate")
      };
    }

    async initialize() {
      this.setInteractive(false);
      await this.loadSettings();
      this.render();
      this.bindEvents();
      this.setInteractive(true);
      this.emitChange();
      return this.getSettings();
    }

    getSettings() {
      return mergeSettings(this.settings);
    }

    cancelRecording() {
      if (!this.recordingAction) {
        return;
      }
      this.recordingAction = null;
      this.render();
      this.showNote("");
    }

    bindEvents() {
      this.document.addEventListener("click", this.handleClick);
      this.document.addEventListener("keydown", this.captureShortcut, true);
      this.elements.feedback.addEventListener("change", this.updateFeedback);
      this.elements.restoreDefaults.addEventListener("click", () => this.restoreDefaults());
    }

    async loadSettings() {
      try {
        this.settings = await loadSettingsFromStorage(this.storageArea, { migrate: true });
      } catch {
        this.settings = defaultSettings();
        this.showNote(t("settingsReadFailed", undefined, "설정을 읽지 못했어요."), "error");
      }
    }

    handleClick(event) {
      const shortcutButton = event.target.closest?.("[data-record-action]");
      if (shortcutButton) {
        this.startRecording(shortcutButton.dataset.recordAction);
        return;
      }

      const settingButton = event.target.closest?.("[data-setting-action]");
      if (!settingButton || this.saving) {
        return;
      }
      const delta = settingButton.dataset.settingAction === "targetDown"
        ? -TARGET_RATE_STEP
        : TARGET_RATE_STEP;
      void this.updateTargetRate(delta);
    }

    render() {
      for (const button of this.elements.shortcutButtons) {
        const action = button.dataset.recordAction;
        const key = shortcutLabel(this.settings.shortcuts[action]);
        button.querySelector("kbd").textContent = this.recordingAction === action ? "…" : key;
        button.dataset.recording = String(this.recordingAction === action);
        button.setAttribute("aria-pressed", String(this.recordingAction === action));
        const label = t(
          "settingsChangeShortcutAria",
          [ACTION_LABELS[action], key],
          `${ACTION_LABELS[action]} 단축키 변경, 현재 ${key}`
        );
        button.setAttribute("aria-label", label);
        button.title = label;
      }
      this.elements.feedback.checked = this.settings.showFeedback;
      this.elements.feedback.setAttribute("aria-label", t(
        "settingsFeedbackAria",
        undefined,
        "화면 피드백"
      ));
      if (this.elements.feedbackToggle) {
        this.elements.feedbackToggle.title = t(
          "settingsFeedbackAria",
          undefined,
          "화면 피드백"
        );
      }
      this.elements.restoreDefaults.title = t(
        "settingsRestoreDefaults",
        undefined,
        "기본값 복원"
      );
      this.elements.targetRate.textContent = `${formatRate(this.settings.targetPlaybackRate)}×`;
    }

    setInteractive(enabled) {
      const interactive = enabled && !this.saving;
      this.elements.panel.setAttribute("aria-busy", String(!interactive));
      this.elements.feedback.disabled = !interactive;
      this.elements.restoreDefaults.disabled = !interactive;
      for (const button of [...this.elements.settingButtons, ...this.elements.shortcutButtons]) {
        button.disabled = !interactive;
      }
    }

    startRecording(action) {
      if (this.saving) {
        return;
      }
      this.recordingAction = this.recordingAction === action ? null : action;
      this.render();
      this.showNote(this.recordingAction
        ? t("settingsRecordingPrompt", undefined, "키 입력 · Esc 취소")
        : "", this.recordingAction ? "recording" : "default");
    }

    async captureShortcut(event) {
      if (!this.recordingAction) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        this.cancelRecording();
        return;
      }

      const shortcut = shortcutFromEvent(event);
      if (!shortcut) {
        this.showNote(t("settingsModifierOnly", undefined, "수정 키만으로는 지정할 수 없어요."), "error");
        return;
      }
      if (shortcut.ctrl || shortcut.alt || shortcut.meta) {
        this.showNote(t("settingsReservedModifiers", undefined, "Ctrl, Alt, Meta 조합은 사용할 수 없어요."), "error");
        return;
      }

      const conflictAction = ACTION_ORDER.find(
        (action) => action !== this.recordingAction
          && shortcutsEqual(this.settings.shortcuts[action], shortcut)
      );
      if (conflictAction) {
        this.showNote(t(
          "settingsShortcutConflict",
          [ACTION_LABELS[conflictAction]],
          `${ACTION_LABELS[conflictAction]}와 키가 겹쳐요.`
        ), "error");
        return;
      }

      const previous = this.getSettings();
      const action = this.recordingAction;
      this.settings.shortcuts[action] = shortcut;
      this.settings.shortcutPresetRevision = null;
      this.recordingAction = null;
      await this.commit(previous, `${shortcutLabel(shortcut)}`);
    }

    async updateTargetRate(delta) {
      const previous = this.getSettings();
      const nextRate = normalizeTargetPlaybackRate(this.settings.targetPlaybackRate + delta);
      if (nextRate === this.settings.targetPlaybackRate) {
        return;
      }
      this.settings.targetPlaybackRate = nextRate;
      await this.commit(previous, `${formatRate(nextRate)}×`);
    }

    async updateFeedback() {
      if (this.saving) {
        return;
      }
      const previous = this.getSettings();
      this.settings.showFeedback = this.elements.feedback.checked;
      await this.commit(previous, t(
        this.settings.showFeedback ? "settingsFeedbackOn" : "settingsFeedbackOff",
        undefined,
        this.settings.showFeedback ? "피드백 켬" : "피드백 끔"
      ));
    }

    async restoreDefaults() {
      if (this.saving) {
        return;
      }
      const previous = this.getSettings();
      this.recordingAction = null;
      this.settings = defaultSettings();
      await this.commit(previous, t("settingsDefaultsRestored", undefined, "기본값 복원"));
    }

    async commit(previous, successMessage) {
      this.saving = true;
      this.render();
      this.emitChange();
      this.setInteractive(false);
      try {
        await this.storageArea.set({ [STORAGE_KEY]: this.settings });
        this.showNote(successMessage, "success");
      } catch {
        this.settings = previous;
        this.render();
        this.emitChange();
        this.showNote(t("settingsSaveFailed", undefined, "저장하지 못했어요."), "error");
      } finally {
        this.saving = false;
        this.setInteractive(true);
      }
    }

    emitChange() {
      this.onChange(this.getSettings());
    }

    showNote(message, tone = "default") {
      clearTimeout(this.noteTimer);
      this.elements.note.textContent = message;
      if (tone === "default") {
        delete this.elements.note.dataset.tone;
      } else {
        this.elements.note.dataset.tone = tone;
      }
      if (message && tone !== "recording") {
        this.noteTimer = setTimeout(() => {
          this.elements.note.textContent = "";
          delete this.elements.note.dataset.tone;
        }, NOTE_DURATION_MS);
      }
    }
  }

  function formatRate(rate) {
    return Number.isInteger(rate)
      ? String(rate)
      : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  globalThis.ViewTune.PopupSettingsController = PopupSettingsController;
})();
