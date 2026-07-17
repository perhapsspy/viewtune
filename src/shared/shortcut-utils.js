(() => {
  "use strict";

  const viewTune = globalThis.ViewTune;
  const {
    ACTION_ORDER,
    DEFAULT_TARGET_PLAYBACK_RATE,
    DEFAULT_SHORTCUTS,
    LEGACY_DEFAULT_SHORTCUTS,
    PUBLISHED_DEFAULT_SHORTCUTS,
    PREVIOUS_DEFAULT_SHORTCUTS,
    SETTINGS_SCHEMA_VERSION,
    SHORTCUT_PRESET_REVISION,
    STORAGE_KEY
  } = viewTune;
  const MODIFIER_CODES = new Set([
    "AltLeft",
    "AltRight",
    "ControlLeft",
    "ControlRight",
    "MetaLeft",
    "MetaRight",
    "OSLeft",
    "OSRight",
    "ShiftLeft",
    "ShiftRight"
  ]);

  const KEY_LABELS = Object.freeze({
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Equal: "=",
    IntlBackslash: "\\",
    IntlRo: "IntlRo",
    IntlYen: "¥",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    Escape: "Esc",
    Backspace: "Backspace",
    Delete: "Delete"
  });

  function cloneShortcut(shortcut) {
    return {
      code: shortcut.code,
      shift: Boolean(shortcut.shift),
      alt: Boolean(shortcut.alt),
      ctrl: Boolean(shortcut.ctrl),
      meta: Boolean(shortcut.meta)
    };
  }

  function normalizeShortcut(shortcut) {
    if (!shortcut || typeof shortcut.code !== "string" || shortcut.code.length === 0) {
      return null;
    }

    return cloneShortcut(shortcut);
  }

  function defaultSettings() {
    return {
      shortcuts: Object.fromEntries(
        ACTION_ORDER.map((action) => [action, cloneShortcut(DEFAULT_SHORTCUTS[action])])
      ),
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      shortcutPresetRevision: SHORTCUT_PRESET_REVISION,
      targetPlaybackRate: DEFAULT_TARGET_PLAYBACK_RATE,
      showFeedback: true
    };
  }

  function mergeSettings(candidate) {
    return upgradeSettings(candidate);
  }

  function upgradeSettings(candidate) {
    const defaults = defaultSettings();
    if (!candidate || typeof candidate !== "object") {
      return defaults;
    }

    const shortcuts = candidate.shortcuts && typeof candidate.shortcuts === "object"
      ? candidate.shortcuts
      : {};

    if (usesPreviousDefaultPreset(shortcuts)) {
      defaults.targetPlaybackRate = normalizeTargetPlaybackRate(candidate.targetPlaybackRate);
      defaults.showFeedback = typeof candidate.showFeedback === "boolean"
        ? candidate.showFeedback
        : defaults.showFeedback;
      return defaults;
    }

    const isCurrentSchema = candidate.schemaVersion === SETTINGS_SCHEMA_VERSION;
    defaults.shortcutPresetRevision = isCurrentSchema
      && typeof candidate.shortcutPresetRevision === "string"
      ? candidate.shortcutPresetRevision
      : null;

    for (const action of ACTION_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(shortcuts, action)) {
        continue;
      }
      const shortcut = normalizeShortcut(shortcuts[action]);
      if (shortcut) {
        defaults.shortcuts[action] = shortcut;
      } else if (isCurrentSchema && shortcuts[action] === null) {
        defaults.shortcuts[action] = null;
      }
    }

    if (!isCurrentSchema
      && !Object.prototype.hasOwnProperty.call(shortcuts, viewTune.ACTIONS.SPEED_TARGET)
      && ACTION_ORDER.some((action) => (
        action !== viewTune.ACTIONS.SPEED_TARGET
        && shortcutsEqual(defaults.shortcuts[action], DEFAULT_SHORTCUTS[viewTune.ACTIONS.SPEED_TARGET])
      ))) {
      defaults.shortcuts[viewTune.ACTIONS.SPEED_TARGET] = null;
    }

    if (typeof candidate.showFeedback === "boolean") {
      defaults.showFeedback = candidate.showFeedback;
    }
    defaults.targetPlaybackRate = normalizeTargetPlaybackRate(candidate.targetPlaybackRate);

    return defaults;
  }

  function usesPreviousDefaultPreset(shortcuts) {
    if (!shortcuts || typeof shortcuts !== "object") {
      return false;
    }

    return [LEGACY_DEFAULT_SHORTCUTS, PREVIOUS_DEFAULT_SHORTCUTS, PUBLISHED_DEFAULT_SHORTCUTS]
      .some((preset) => presetMatches(shortcuts, preset));
  }

  function presetMatches(shortcuts, preset) {
    const presetActions = Object.keys(preset).sort();
    const candidateActions = Object.keys(shortcuts).sort();
    return candidateActions.length === presetActions.length
      && candidateActions.every((action, index) => action === presetActions[index])
      && presetActions.every((action) => shortcutsEqual(shortcuts[action], preset[action]));
  }

  function normalizeTargetPlaybackRate(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_TARGET_PLAYBACK_RATE;
    }
    return Math.round(Math.max(0.5, Math.min(4, value)) * 100) / 100;
  }

  async function loadSettingsFromStorage(storageArea, { migrate = false } = {}) {
    const stored = await storageArea.get(STORAGE_KEY);
    const candidate = stored[STORAGE_KEY];
    const settings = mergeSettings(candidate);
    if (migrate && needsSettingsMigration(candidate)) {
      try {
        await migrateStoredSettings(storageArea);
      } catch {
        // 읽기에 성공한 사용자 설정은 동기화 저장이 일시 실패해도 계속 적용한다.
      }
    }
    return settings;
  }

  async function migrateStoredSettings(storageArea) {
    const latest = await storageArea.get(STORAGE_KEY);
    const latestCandidate = latest[STORAGE_KEY];
    if (needsSettingsMigration(latestCandidate)) {
      await storageArea.set({ [STORAGE_KEY]: upgradeSettings(latestCandidate) });
    }
  }

  function needsSettingsMigration(candidate) {
    return Boolean(
      candidate
      && typeof candidate === "object"
      && candidate.schemaVersion !== SETTINGS_SCHEMA_VERSION
    );
  }
  function isModifierCode(code) {
    return MODIFIER_CODES.has(code);
  }

  function shortcutFromEvent(event) {
    if (!event || isModifierCode(event.code)) {
      return null;
    }

    return {
      code: event.code,
      shift: Boolean(event.shiftKey),
      alt: Boolean(event.altKey),
      ctrl: Boolean(event.ctrlKey),
      meta: Boolean(event.metaKey)
    };
  }

  function shortcutsEqual(left, right) {
    const normalizedLeft = normalizeShortcut(left);
    const normalizedRight = normalizeShortcut(right);
    if (!normalizedLeft || !normalizedRight) {
      return false;
    }

    return normalizedLeft.code === normalizedRight.code
      && normalizedLeft.shift === normalizedRight.shift
      && normalizedLeft.alt === normalizedRight.alt
      && normalizedLeft.ctrl === normalizedRight.ctrl
      && normalizedLeft.meta === normalizedRight.meta;
  }

  function matchesShortcut(event, shortcut) {
    return shortcutsEqual(shortcutFromEvent(event), shortcut);
  }

  function actionForEvent(event, shortcuts) {
    return ACTION_ORDER.find((action) => matchesShortcut(event, shortcuts[action])) || null;
  }

  function baseKeyLabel(code) {
    if (/^Key[A-Z]$/.test(code)) {
      return code.slice(3);
    }
    if (/^Digit[0-9]$/.test(code)) {
      return code.slice(5);
    }
    if (/^Numpad[0-9]$/.test(code)) {
      return `Num ${code.slice(6)}`;
    }
    if (/^F[1-9][0-2]?$/.test(code)) {
      return code;
    }
    return KEY_LABELS[code] || code;
  }

  function shortcutLabel(shortcut) {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) {
      return viewTune.t?.("shortcutUnassigned", undefined, "미지정") || "미지정";
    }

    if (normalized.shift && normalized.code === "Comma" && !normalized.alt && !normalized.ctrl && !normalized.meta) {
      return "<";
    }
    if (normalized.shift && normalized.code === "Period" && !normalized.alt && !normalized.ctrl && !normalized.meta) {
      return ">";
    }

    const modifiers = [];
    if (normalized.ctrl) modifiers.push("Ctrl");
    if (normalized.alt) modifiers.push("Alt");
    if (normalized.meta) modifiers.push("⌘");
    if (normalized.shift) modifiers.push("Shift");
    modifiers.push(baseKeyLabel(normalized.code));
    return modifiers.join(" + ");
  }

  function isEditableTarget(target) {
    if (!target?.closest) {
      return false;
    }

    const editable = target.closest(
      "input, textarea, select, [contenteditable], [role='textbox']"
    );
    if (!editable) {
      return false;
    }
    if (editable.hasAttribute("contenteditable")) {
      return editable.isContentEditable;
    }
    return !editable.hasAttribute("disabled")
      && !editable.hasAttribute("readonly")
      && editable.getAttribute("aria-disabled") !== "true";
  }

  const shortcutUtils = {
    actionForEvent,
    cloneShortcut,
    defaultSettings,
    isEditableTarget,
    isModifierCode,
    loadSettingsFromStorage,
    matchesShortcut,
    mergeSettings,
    migrateStoredSettings,
    needsSettingsMigration,
    normalizeShortcut,
    normalizeTargetPlaybackRate,
    shortcutFromEvent,
    shortcutLabel,
    shortcutsEqual,
    upgradeSettings,
    usesPreviousDefaultPreset
  };

  Object.assign(viewTune, shortcutUtils);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = shortcutUtils;
  }
})();
