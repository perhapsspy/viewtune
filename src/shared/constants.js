(() => {
  "use strict";

  const ACTIONS = Object.freeze({
    WIDE: "wide",
    WINDOW: "window",
    SPEED_DOWN: "speedDown",
    SPEED_UP: "speedUp",
    SPEED_RESET: "speedReset"
  });

  const ACTION_ORDER = Object.freeze([
    ACTIONS.WIDE,
    ACTIONS.WINDOW,
    ACTIONS.SPEED_DOWN,
    ACTIONS.SPEED_UP,
    ACTIONS.SPEED_RESET
  ]);

  const DEFAULT_SHORTCUTS = Object.freeze({
    [ACTIONS.WIDE]: Object.freeze({ code: "KeyU", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.WINDOW]: Object.freeze({ code: "KeyV", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_DOWN]: Object.freeze({ code: "BracketLeft", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_UP]: Object.freeze({ code: "BracketRight", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_RESET]: Object.freeze({ code: "KeyR", shift: false, alt: false, ctrl: false, meta: false })
  });

  const PREVIOUS_DEFAULT_SHORTCUTS = Object.freeze({
    [ACTIONS.WIDE]: Object.freeze({ code: "KeyU", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.WINDOW]: Object.freeze({ code: "KeyW", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_DOWN]: Object.freeze({ code: "BracketLeft", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_UP]: Object.freeze({ code: "BracketRight", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_RESET]: Object.freeze({ code: "KeyR", shift: false, alt: false, ctrl: false, meta: false })
  });

  const LEGACY_DEFAULT_SHORTCUTS = Object.freeze({
    [ACTIONS.WIDE]: Object.freeze({ code: "KeyN", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.WINDOW]: Object.freeze({ code: "KeyM", shift: false, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_DOWN]: Object.freeze({ code: "Comma", shift: true, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_UP]: Object.freeze({ code: "Period", shift: true, alt: false, ctrl: false, meta: false }),
    [ACTIONS.SPEED_RESET]: Object.freeze({ code: "Slash", shift: false, alt: false, ctrl: false, meta: false })
  });

  const ACTION_LABELS = Object.freeze({
    [ACTIONS.WIDE]: "21:9 확대",
    [ACTIONS.WINDOW]: "창 맞춤",
    [ACTIONS.SPEED_DOWN]: "속도 0.5× 낮춤",
    [ACTIONS.SPEED_UP]: "속도 0.5× 높임",
    [ACTIONS.SPEED_RESET]: "속도 1× 초기화"
  });

  const STORAGE_KEY = "viewTuneSettings";

  const BUILD_ID = "0.2.1-20260713-viewtune-ui-v9";
  const MIN_PLAYBACK_RATE = 0.5;
  const MAX_PLAYBACK_RATE = 4;

  function runtimeIdentity(runtime = globalThis.chrome?.runtime) {
    try {
      const manifest = typeof runtime?.getManifest === "function"
        ? runtime.getManifest()
        : null;
      return {
        buildId: BUILD_ID,
        extensionId: runtime?.id || null,
        manifestVersion: manifest?.version || null
      };
    } catch {
      return {
        buildId: BUILD_ID,
        extensionId: null,
        manifestVersion: null
      };
    }
  }

  function runtimeIdentitiesEqual(left, right) {
    return Boolean(
      left
      && right
      && left.buildId
      && left.extensionId
      && left.manifestVersion
      && left.buildId === right.buildId
      && left.extensionId === right.extensionId
      && left.manifestVersion === right.manifestVersion
    );
  }

  const viewTune = (globalThis.ViewTune = globalThis.ViewTune || {});
  Object.assign(viewTune, {
    ACTIONS,
    ACTION_ORDER,
    ACTION_LABELS,
    BUILD_ID,
    DEFAULT_SHORTCUTS,
    LEGACY_DEFAULT_SHORTCUTS,

    PREVIOUS_DEFAULT_SHORTCUTS,
    STORAGE_KEY,
    MIN_PLAYBACK_RATE,
    MAX_PLAYBACK_RATE,
    runtimeIdentity,
    runtimeIdentitiesEqual
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = viewTune;
  }
})();
