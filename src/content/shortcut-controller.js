(() => {
  "use strict";

  const {
    ACTIONS,
    STORAGE_KEY,
    actionForEvent,
    defaultSettings,
    isEditableTarget,
    loadSettingsFromStorage,
    mergeSettings
  } = globalThis.ViewTune;

  class ShortcutController {
    constructor(videoController, onFrameActivity) {
      this.videoController = videoController;
      this.onFrameActivity = onFrameActivity;
      this.settings = defaultSettings();
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleStorageChange = this.handleStorageChange.bind(this);
    }

    start() {
      this.applySettings(this.settings);
      this.document.addEventListener("keydown", this.handleKeydown, true);
      chrome.storage.onChanged.addListener(this.handleStorageChange);
      this.loadSettings();
    }

    get document() {
      return this.videoController.document;
    }

    get window() {
      return this.videoController.window;
    }

    async loadSettings() {
      try {
        const settings = await loadSettingsFromStorage(chrome.storage.sync, {
          migrate: this.isTopFrame()
        });
        this.applySettings(settings);
      } catch {
        // 기본값은 이미 적용되어 있으므로 페이지 제어를 계속 제공한다.
      }
    }

    handleStorageChange(changes, areaName) {
      if (areaName !== "sync" || !changes[STORAGE_KEY]) {
        return;
      }
      this.applySettings(mergeSettings(changes[STORAGE_KEY].newValue));
    }

    applySettings(settings) {
      this.settings = settings;
      this.videoController.setFeedbackEnabled(settings.showFeedback);
      this.videoController.setTargetPlaybackRate?.(settings.targetPlaybackRate);
    }

    isTopFrame() {
      try {
        return Boolean(this.window && this.window.top === this.window);
      } catch {
        return false;
      }
    }

    handleKeydown(event) {
      if (event.isComposing) {
        return;
      }

      if (event.code === "Escape" && this.videoController.hasActiveWindowLayout?.()) {
        const result = this.videoController.dismissWindowLayout();
        this.consumeEvent(event);
        if (result.ok) {
          this.onFrameActivity();
        }
        return;
      }

      if (this.isEditableEvent(event)) {
        return;
      }

      const action = actionForEvent(event, this.settings.shortcuts);
      if (!action) {
        return;
      }

      if (event.repeat && this.isLayoutAction(action)) {
        if (this.videoController.hasControllableVideo()) {
          this.consumeEvent(event);
        }
        return;
      }

      const result = this.videoController.execute(action);
      if (!result.found) {
        return;
      }

      this.consumeEvent(event);
      if (!result.ok) {
        return;
      }

      this.onFrameActivity();
    }

    isEditableEvent(event) {
      const targets = typeof event.composedPath === "function"
        ? event.composedPath()
        : [event.target];
      return targets.some((target) => isEditableTarget(target));
    }

    isLayoutAction(action) {
      return action === ACTIONS.WIDE || action === ACTIONS.WINDOW;
    }

    consumeEvent(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  globalThis.ViewTune.ShortcutController = ShortcutController;
})();
