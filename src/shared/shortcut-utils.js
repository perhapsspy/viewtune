(() => {
  "use strict";

  const viewTune = globalThis.ViewTune;
  const {
    ACTION_ORDER,
    DEFAULT_SHORTCUTS,
    LEGACY_DEFAULT_SHORTCUTS,

    PREVIOUS_DEFAULT_SHORTCUTS,
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
      showFeedback: true
    };
  }

  function mergeSettings(candidate) {
    const defaults = defaultSettings();
    if (!candidate || typeof candidate !== "object") {
      return defaults;
    }

    const shortcuts = candidate.shortcuts && typeof candidate.shortcuts === "object"
      ? candidate.shortcuts
      : {};

    if (usesPreviousDefaultPreset(shortcuts)) {
      defaults.showFeedback = typeof candidate.showFeedback === "boolean"
        ? candidate.showFeedback
        : defaults.showFeedback;
      return defaults;
    }

    for (const action of ACTION_ORDER) {
      const shortcut = normalizeShortcut(shortcuts[action]);
      if (shortcut) {
        defaults.shortcuts[action] = shortcut;
      }
    }

    if (typeof candidate.showFeedback === "boolean") {
      defaults.showFeedback = candidate.showFeedback;
    }

    return defaults;
  }

  function usesPreviousDefaultPreset(shortcuts) {
    if (!shortcuts || typeof shortcuts !== "object") {
      return false;
    }

    return [LEGACY_DEFAULT_SHORTCUTS, PREVIOUS_DEFAULT_SHORTCUTS]
      .some((preset) => ACTION_ORDER.every((action) => shortcutsEqual(
        shortcuts[action],
        preset[action]
      )));
  }

  async function loadSettingsFromStorage(storageArea, { migrate = false } = {}) {
    const stored = await storageArea.get(STORAGE_KEY);
    const candidate = stored[STORAGE_KEY];
    const settings = mergeSettings(candidate);
    if (migrate && usesPreviousDefaultPreset(candidate?.shortcuts)) {
      await migrateStoredSettings(storageArea);
    }
    return settings;
  }

  async function migrateStoredSettings(storageArea) {
    const latest = await storageArea.get(STORAGE_KEY);
    const latestCandidate = latest[STORAGE_KEY];
    if (latestCandidate !== undefined
        && usesPreviousDefaultPreset(latestCandidate?.shortcuts)) {
      await storageArea.set({ [STORAGE_KEY]: mergeSettings(latestCandidate) });
    }
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
      return "미지정";
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
    normalizeShortcut,
    shortcutFromEvent,
    shortcutLabel,
    shortcutsEqual,
    usesPreviousDefaultPreset
  };

  Object.assign(viewTune, shortcutUtils);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = shortcutUtils;
  }
})();
