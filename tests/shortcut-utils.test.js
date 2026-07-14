"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const constants = require("../src/shared/constants.js");
const shortcuts = require("../src/shared/shortcut-utils.js");
require("../src/content/video-controller.js");
require("../src/content/shortcut-controller.js");

const { ShortcutController, VideoController } = globalThis.ViewTune;

function keyboardEvent(overrides) {
  return {
    code: "KeyU",
    key: "u",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...overrides
  };
}

test("기본 설정은 YouTube와 겹치지 않는 다섯 물리 키 단축키를 제공한다", () => {
  const settings = shortcuts.defaultSettings();

  assert.deepEqual(settings.shortcuts[constants.ACTIONS.WIDE], {
    code: "KeyU",
    shift: false,
    alt: false,
    ctrl: false,
    meta: false
  });
  assert.equal(settings.shortcuts[constants.ACTIONS.WINDOW].code, "KeyV");
  assert.equal(settings.shortcuts[constants.ACTIONS.SPEED_DOWN].code, "BracketLeft");
  assert.equal(settings.shortcuts[constants.ACTIONS.SPEED_UP].code, "BracketRight");
  assert.equal(settings.shortcuts[constants.ACTIONS.SPEED_RESET].code, "KeyR");
  assert.equal(Object.keys(settings.shortcuts).length, 5);
  assert.equal(settings.showFeedback, true);
});

test("한글 IME에서 key 값이 달라도 KeyU 물리 위치를 인식한다", () => {
  const settings = shortcuts.defaultSettings();
  const koreanLayoutEvent = keyboardEvent({ key: "ㅕ" });

  assert.equal(
    shortcuts.actionForEvent(koreanLayoutEvent, settings.shortcuts),
    constants.ACTIONS.WIDE
  );
});

test("[와 ] 위치로 속도를 조절하고 기존 YouTube 단축키는 기본값에서 비활성화한다", () => {
  const settings = shortcuts.defaultSettings();

  assert.equal(
    shortcuts.actionForEvent(keyboardEvent({ code: "BracketLeft", key: "[" }), settings.shortcuts),
    constants.ACTIONS.SPEED_DOWN
  );
  assert.equal(
    shortcuts.actionForEvent(keyboardEvent({ code: "BracketRight", key: "]" }), settings.shortcuts),
    constants.ACTIONS.SPEED_UP
  );
  assert.equal(
    shortcuts.actionForEvent(keyboardEvent({ code: "KeyN", key: "n" }), settings.shortcuts),
    null
  );
  assert.equal(
    shortcuts.actionForEvent(keyboardEvent({ code: "KeyM", key: "m" }), settings.shortcuts),
    null
  );
  assert.equal(
    shortcuts.actionForEvent(keyboardEvent({ code: "Slash", key: "/" }), settings.shortcuts),
    null
  );
});

test("저장값은 유효한 항목만 기본값 위에 덮어쓴다", () => {
  const settings = shortcuts.mergeSettings({
    shortcuts: {
      [constants.ACTIONS.WINDOW]: { code: "KeyK", shift: true }
    },
    showFeedback: false
  });

  assert.deepEqual(settings.shortcuts[constants.ACTIONS.WINDOW], {
    code: "KeyK",
    shift: true,
    alt: false,
    ctrl: false,
    meta: false
  });
  assert.equal(settings.shortcuts[constants.ACTIONS.WIDE].code, "KeyU");
  assert.equal(settings.showFeedback, false);
});

test("표시는 기본 [와 ]를 읽기 쉬운 키캡으로 유지한다", () => {
  const settings = shortcuts.defaultSettings();

  assert.equal(shortcuts.shortcutLabel(settings.shortcuts[constants.ACTIONS.SPEED_DOWN]), "[");
  assert.equal(shortcuts.shortcutLabel(settings.shortcuts[constants.ACTIONS.SPEED_UP]), "]");
  assert.equal(shortcuts.shortcutLabel({ code: "KeyK", shift: true }), "Shift + K");
});

test("최초 출시 기본값 전체 저장본은 새 기본 단축키로 자동 전환한다", () => {
  const legacyShortcuts = Object.fromEntries(
    constants.ACTION_ORDER.map((action) => [action, { ...constants.LEGACY_DEFAULT_SHORTCUTS[action] }])
  );
  const settings = shortcuts.mergeSettings({ shortcuts: legacyShortcuts, showFeedback: false });

  assert.equal(settings.shortcuts[constants.ACTIONS.WIDE].code, "KeyU");
  assert.equal(settings.shortcuts[constants.ACTIONS.WINDOW].code, "KeyV");
  assert.equal(settings.showFeedback, false);
});

test("U/W 기본값 전체 저장본도 U/V 기본값으로 자동 전환한다", () => {
  const previousShortcuts = Object.fromEntries(
    constants.ACTION_ORDER.map((action) => [
      action,
      { ...constants.PREVIOUS_DEFAULT_SHORTCUTS[action] }
    ])
  );
  const settings = shortcuts.mergeSettings({ shortcuts: previousShortcuts, showFeedback: false });

  assert.equal(settings.shortcuts[constants.ACTIONS.WIDE].code, "KeyU");
  assert.equal(settings.shortcuts[constants.ACTIONS.WINDOW].code, "KeyV");
  assert.equal(settings.showFeedback, false);
  assert.equal(shortcuts.usesPreviousDefaultPreset(previousShortcuts), true);
});

test("U/W 세트에서 하나라도 사용자가 바꾼 값은 자동 이관하지 않는다", () => {
  const customizedShortcuts = Object.fromEntries(
    constants.ACTION_ORDER.map((action) => [
      action,
      { ...constants.PREVIOUS_DEFAULT_SHORTCUTS[action] }
    ])
  );
  customizedShortcuts[constants.ACTIONS.SPEED_RESET] = {
    code: "KeyQ",
    shift: false,
    alt: false,
    ctrl: false,
    meta: false
  };

  const settings = shortcuts.mergeSettings({ shortcuts: customizedShortcuts });
  assert.equal(settings.shortcuts[constants.ACTIONS.WINDOW].code, "KeyW");
  assert.equal(settings.shortcuts[constants.ACTIONS.SPEED_RESET].code, "KeyQ");
  assert.equal(shortcuts.usesPreviousDefaultPreset(customizedShortcuts), false);
});

test("저장 설정이 없는 신규 설치는 이전 프리셋으로 오인하지 않는다", () => {
  assert.equal(shortcuts.usesPreviousDefaultPreset(undefined), false);
  assert.equal(shortcuts.usesPreviousDefaultPreset(null), false);
});

test("최상위 프레임은 최신 저장값을 다시 확인한 뒤 이전 프리셋을 한 번만 이관한다", async () => {
  const previousChrome = globalThis.chrome;
  const previousSettings = {
    shortcuts: Object.fromEntries(
      constants.ACTION_ORDER.map((action) => [
        action,
        { ...constants.PREVIOUS_DEFAULT_SHORTCUTS[action] }
      ])
    ),
    showFeedback: false
  };
  const writes = [];
  let readCount = 0;
  globalThis.chrome = {
    storage: {
      sync: {
        async get() {
          readCount += 1;
          return { [constants.STORAGE_KEY]: previousSettings };
        },
        async set(value) {
          writes.push(value);
        }
      }
    }
  };

  try {
    const windowRef = {};
    windowRef.top = windowRef;
    const controller = new ShortcutController({
      document: { addEventListener() {} },
      window: windowRef,
      setFeedbackEnabled() {}
    }, () => {});

    await controller.loadSettings();

    assert.equal(readCount, 2);
    assert.equal(writes.length, 1);
    assert.equal(
      writes[0][constants.STORAGE_KEY].shortcuts[constants.ACTIONS.WINDOW].code,
      "KeyV"
    );
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test("런타임 식별자는 확장 ID와 manifest 버전, 정적 빌드 ID를 함께 제공한다", () => {
  const runtime = {
    id: "viewtune-test-extension",
    getManifest: () => ({ version: "9.8.7" })
  };

  const identity = constants.runtimeIdentity(runtime);
  assert.deepEqual(identity, {
    buildId: constants.BUILD_ID,
    extensionId: "viewtune-test-extension",
    manifestVersion: "9.8.7"
  });
  assert.equal(constants.runtimeIdentitiesEqual(identity, { ...identity }), true);
  assert.equal(constants.runtimeIdentitiesEqual(identity, { ...identity, manifestVersion: "9.8.6" }), false);
});

test("하나라도 사용자가 바꾼 기존 단축키 세트는 그대로 보존한다", () => {
  const legacyShortcuts = Object.fromEntries(
    constants.ACTION_ORDER.map((action) => [action, { ...constants.LEGACY_DEFAULT_SHORTCUTS[action] }])
  );
  legacyShortcuts[constants.ACTIONS.SPEED_RESET] = {
    code: "KeyQ",
    shift: false,
    alt: false,
    ctrl: false,
    meta: false
  };

  const settings = shortcuts.mergeSettings({ shortcuts: legacyShortcuts });
  assert.equal(settings.shortcuts[constants.ACTIONS.WIDE].code, "KeyN");
  assert.equal(settings.shortcuts[constants.ACTIONS.SPEED_RESET].code, "KeyQ");
});

test("plaintext-only 편집기는 단축키 가로채기 대상에서 제외한다", () => {
  const plaintextEditor = {
    closest: () => ({
      hasAttribute: (name) => name === "contenteditable",
      isContentEditable: true,
      getAttribute: () => null
    })
  };

  assert.equal(shortcuts.isEditableTarget(plaintextEditor), true);
});

test("Shadow DOM 경로 안의 편집기에서도 단축키를 무시한다", () => {
  const plaintextEditor = {
    closest: () => ({
      hasAttribute: (name) => name === "contenteditable",
      isContentEditable: true,
      getAttribute: () => null
    })
  };
  const controller = new ShortcutController({
    document: { addEventListener() {} },
    setFeedbackEnabled() {}
  }, () => {});

  assert.equal(controller.isEditableEvent({
    composedPath: () => [{ closest: () => null }, plaintextEditor]
  }), true);
});

test("설정된 화면 단축키는 적용 실패 시에도 YouTube로 새지 않는다", () => {
  let frameActivityCount = 0;
  let executedAction = null;
  let prevented = false;
  let stopped = false;
  const controller = new ShortcutController({
    document: { addEventListener() {} },
    setFeedbackEnabled() {},
    execute(action) {
      executedAction = action;
      return { found: true, ok: false };
    }
  }, () => {
    frameActivityCount += 1;
  });

  controller.handleKeydown(keyboardEvent({
    code: "KeyV",
    key: "ㅍ",
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    }
  }));

  assert.equal(executedAction, constants.ACTIONS.WINDOW);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(frameActivityCount, 0);
});

test("제어할 영상이 없는 페이지에서는 ViewTune 키를 사이트에 돌려준다", () => {
  let prevented = false;
  let stopped = false;
  const controller = new ShortcutController({
    document: { addEventListener() {} },
    setFeedbackEnabled() {},
    execute: () => ({ found: false, ok: false })
  }, () => {});

  controller.handleKeydown(keyboardEvent({
    code: "KeyV",
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    }
  }));

  assert.equal(prevented, false);
  assert.equal(stopped, false);
});

test("iframe 안의 V는 부분 확대를 성공으로 오인하지 않고 명시적으로 거절한다", () => {
  const frameWindow = { top: {} };
  const video = { isConnected: true, playbackRate: 1 };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: frameWindow
  });
  let feedback = "";
  controller.findVideo = () => video;
  controller.playerSurfaceFor = () => {
    throw new Error("iframe에서는 surface 탐색 전에 거절해야 합니다.");
  };
  controller.showToast = (message) => {
    feedback = message;
  };

  const result = controller.execute(constants.ACTIONS.WINDOW);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "embedded-frame");
  assert.equal(controller.activeWindowLayout, null);
  assert.match(feedback, /iframe/);
});

test("작은 최근 미리보기보다 화면의 큰 비디오를 우선 선택한다", () => {
  class FakeVideo {
    constructor({ left, top, width, height, paused = true, ended = false }) {
      this.left = left;
      this.top = top;
      this.width = width;
      this.height = height;
      this.paused = paused;
      this.ended = ended;
      this.isConnected = true;
    }

    getBoundingClientRect() {
      return {
        left: this.left,
        top: this.top,
        right: this.left + this.width,
        bottom: this.top + this.height,
        width: this.width,
        height: this.height
      };
    }
  }

  const mainVideo = new FakeVideo({ left: 0, top: 0, width: 900, height: 500 });
  const smallPreview = new FakeVideo({ left: 20, top: 20, width: 150, height: 100, paused: false });
  const endedVideo = new FakeVideo({ left: 0, top: 0, width: 980, height: 550, ended: true });
  const documentRef = {
    addEventListener() {},
    querySelectorAll: () => [mainVideo, smallPreview, endedVideo]
  };
  const windowRef = {
    HTMLVideoElement: FakeVideo,
    innerWidth: 1000,
    innerHeight: 600,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" })
  };
  const controller = new VideoController({ documentRef, windowRef });
  controller.lastInteractedVideo = smallPreview;
  controller.lastInteractionAt = Date.now();
  controller.lastPlayingVideo = smallPreview;
  controller.lastPlayAt = Date.now();

  assert.equal(controller.findVideo(), mainVideo);
});

test("Popover 기능과 제어 증거가 없는 플레이어는 화면 모드를 거절한다", () => {
  class FakeElement {
    constructor(parentElement = null) {
      this.parentElement = parentElement;
    }
  }

  class FakeVideo extends FakeElement {}

  const documentRoot = new FakeElement();
  const containedParent = new FakeElement(documentRoot);
  const customPlayer = new FakeElement(containedParent);
  const video = new FakeVideo(customPlayer);
  const documentRef = {
    documentElement: documentRoot,
    addEventListener() {}
  };
  const windowRef = {
    HTMLVideoElement: FakeVideo,
    getComputedStyle: (element) => ({
      transform: "none",
      perspective: "none",
      filter: "none",
      backdropFilter: "none",
      contain: element === containedParent ? "strict" : "none",
      willChange: "auto",
      contentVisibility: "visible",
      containerType: "normal"
    })
  };
  const controller = new VideoController({ documentRef, windowRef });

  assert.equal(controller.layoutPlanFor(customPlayer, video), null);
});

test("Popover 기능이 없는 이름 기반 YouTube 모형에는 V를 적용하지 않는다", () => {
  class FakeElement {
    constructor({ id = "", parentElement = null, classes = [] } = {}) {
      this.id = id;
      this.parentElement = parentElement;
      this.classes = new Set(classes);
      this.attributes = new Map();
      this.moviePlayer = null;
      this.isConnected = true;
    }

    get classList() {
      return { contains: (name) => this.classes.has(name) };
    }

    closest(selector) {
      let current = this;
      while (current) {
        if (selector === "#player-container-outer" && current.id === "player-container-outer") {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    querySelector(selector) {
      return selector === "#movie_player" ? this.moviePlayer : null;
    }

    setAttribute(name, value) {
      this.attributes.set(name, value);
    }

    getAttribute(name) {
      return this.attributes.get(name) || null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }
  }

  const outer = new FakeElement({ id: "player-container-outer" });
  const inner = new FakeElement({ id: "player-container-inner", parentElement: outer });
  const container = new FakeElement({ id: "player-container", parentElement: inner });
  const moviePlayer = new FakeElement({
    id: "movie_player",
    parentElement: container
  });
  outer.moviePlayer = moviePlayer;
  const documentRef = { addEventListener() {} };
  const controller = new VideoController({ documentRef, windowRef: {} });

  const layout = controller.activateWindowLayout({
    surface: moviePlayer,
    video: {}
  });

  assert.equal(layout, null);
});

test("이름만 흉내 낸 영화관 DOM도 기능 계약이 없으면 V를 적용하지 않는다", () => {
  class FakeElement {
    constructor({ id = "", parentElement = null } = {}) {
      this.id = id;
      this.parentElement = parentElement;
      this.attributes = new Map();
      this.isConnected = true;
    }

    closest(selector) {
      const id = selector.startsWith("#") ? selector.slice(1) : null;
      let current = this;
      while (current) {
        if (id && current.id === id) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    setAttribute(name, value) {
      this.attributes.set(name, value);
    }

    getAttribute(name) {
      return this.attributes.get(name) || null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }
  }

  const root = new FakeElement({ id: "root" });
  const boundary = new FakeElement({ id: "boundary", parentElement: root });
  const fullBleed = new FakeElement({ id: "player-full-bleed-container", parentElement: root });
  const outer = new FakeElement({ id: "player-container-outer", parentElement: fullBleed });
  const playerContainer = new FakeElement({ id: "player-container", parentElement: outer });
  const moviePlayer = new FakeElement({ id: "movie_player", parentElement: playerContainer });
  const documentRef = {
    documentElement: root,
    fullscreenElement: null,
    addEventListener() {}
  };
  const controller = new VideoController({
    documentRef,
    windowRef: {
      getComputedStyle: (element) => ({
        transform: "none",
        perspective: "none",
        filter: "none",
        backdropFilter: "none",
        contain: element === fullBleed || element === boundary ? "paint" : "none",
        willChange: "auto",
        contentVisibility: "visible",
        containerType: "normal"
      })
    }
  });

  const layout = controller.activateWindowLayout({ surface: moviePlayer, video: {} });

  assert.equal(layout, null);

  fullBleed.parentElement = boundary;
  assert.equal(controller.layoutPlanFor(moviePlayer, {}), null);

  fullBleed.parentElement = root;
  documentRef.fullscreenElement = moviePlayer;
  assert.equal(controller.layoutPlanFor(moviePlayer, {}), null);
});

test("기능 계약이 없는 플레이어에는 직접 fixed fallback을 쓰지 않는다", () => {
  const moviePlayer = {
    id: "movie_player",
    classList: { contains: (name) => name === "html5-video-player" },
    closest: () => null
  };
  const controller = new VideoController({ documentRef: { addEventListener() {} }, windowRef: {} });

  assert.equal(controller.layoutPlanFor(moviePlayer, {}), null);
});

test("기하 정보와 Popover 기능이 없는 모형은 안전하게 화면 모드를 거절한다", () => {
  class FakeElement {
    constructor({ id = "", parentElement = null } = {}) {
      this.id = id;
      this.parentElement = parentElement;
    }

    closest(selector) {
      let current = this;
      while (current) {
        if (selector === "#player-container-outer" && current.id === "player-container-outer") {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }
  }

  const root = new FakeElement({ id: "root" });
  const boundary = new FakeElement({ id: "boundary", parentElement: root });
  const outer = new FakeElement({ id: "player-container-outer", parentElement: boundary });
  const moviePlayer = new FakeElement({ id: "movie_player", parentElement: outer });
  const controller = new VideoController({
    documentRef: { documentElement: root, addEventListener() {} },
    windowRef: {
      getComputedStyle: (element) => ({
        transform: "none",
        perspective: "none",
        filter: "none",
        backdropFilter: "none",
        contain: element === boundary ? "paint" : "none",
        willChange: "auto",
        contentVisibility: "visible",
        containerType: "normal"
      })
    }
  });

  assert.equal(controller.layoutPlanFor(moviePlayer, {}), null);
});

function layoutRect(left = 0, top = 0, width = 1280, height = 720) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

class FakeLayoutNode {
  constructor({ parentElement = null, box = layoutRect(), control = false, nativeControls = false } = {}) {
    this.parentElement = null;
    this.children = [];
    this.box = box;
    this.control = control;
    this.controls = nativeControls;
    this.attributes = new Map();
    this.listeners = new Map();
    this.isConnected = true;
    this.popoverOpen = false;
    const properties = new Map();
    const priorities = new Map();
    this.style = {
      getPropertyValue: (name) => properties.get(name) || "",
      getPropertyPriority: (name) => priorities.get(name) || "",
      setProperty: (name, value, priority = "") => {
        properties.set(name, value);
        priorities.set(name, priority);
      },
      removeProperty: (name) => {
        properties.delete(name);
        priorities.delete(name);
      }
    };
    if (parentElement) {
      parentElement.append(this);
    }
  }

  append(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
  }

  contains(target) {
    let current = target;
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  closest() {
    return null;
  }

  querySelectorAll() {
    const controls = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.control) {
          controls.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return controls;
  }

  getBoundingClientRect() {
    return this.box;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(type, event) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }

  showPopover() {
    if (this.getAttribute("popover") !== "manual") {
      throw new Error("manual popover attribute required");
    }
    this.popoverOpen = true;
  }

  hidePopover() {
    this.popoverOpen = false;
  }

  matches(selector) {
    return selector === ":popover-open" && this.popoverOpen;
  }
}

function anonymousPlayerFixture() {
  const root = new FakeLayoutNode();
  const host = new FakeLayoutNode({ parentElement: root });
  const bridge = new FakeLayoutNode({ parentElement: host });
  const surface = new FakeLayoutNode({ parentElement: bridge });
  const video = new FakeLayoutNode({ parentElement: surface });
  const control = new FakeLayoutNode({
    parentElement: surface,
    box: layoutRect(24, 670, 120, 32),
    control: true
  });
  const rightControl = new FakeLayoutNode({
    parentElement: surface,
    box: layoutRect(1136, 670, 120, 32),
    control: true
  });
  return { root, host, bridge, surface, video, control, rightControl };
}

test("V는 이름이 없는 플레이어를 기하와 제어 기능으로 찾아 Popover에 올리고 정확히 복원한다", () => {
  const fixture = anonymousPlayerFixture();
  let focusRestoreOptions = null;
  let restoredScroll = null;
  const focusedElement = {
    isConnected: true,
    focus(options) {
      focusRestoreOptions = options;
    }
  };
  const documentRef = {
    documentElement: fixture.root,
    body: null,
    fullscreenElement: null,
    pictureInPictureElement: null,
    activeElement: focusedElement,
    addEventListener() {}
  };
  const controller = new VideoController({
    documentRef,
    windowRef: {
      scrollX: 120,
      scrollY: 340,
      scrollTo: (x, y) => {
        restoredScroll = [x, y];
      },
      getComputedStyle: () => ({ display: "flex" })
    }
  });
  fixture.host.style.setProperty("--viewtune-window-display", "inline-grid", "important");

  assert.equal(controller.playerSurfaceFor(fixture.video), fixture.surface);
  const layout = controller.activateWindowLayout({
    surface: fixture.surface,
    video: fixture.video
  });

  assert.equal(layout.layoutElement, fixture.host);
  assert.equal(layout.strategy, "popover");
  assert.equal(fixture.host.getAttribute("popover"), "manual");
  assert.equal(fixture.host.getAttribute("data-viewtune-window-host"), constants.ACTIONS.WINDOW);
  assert.equal(fixture.host.hasAttribute("data-viewtune-window-pending"), true);
  assert.equal(fixture.bridge.hasAttribute("data-viewtune-window-fill"), true);
  assert.equal(fixture.surface.hasAttribute("data-viewtune-window-frame"), true);
  assert.equal(fixture.video.hasAttribute("data-viewtune-window-video"), true);
  assert.equal(fixture.host.popoverOpen, true);
  assert.equal(fixture.host.style.getPropertyValue("--viewtune-window-display"), "flex");

  documentRef.activeElement = fixture.control;
  controller.deactivateWindowLayout(layout);
  assert.equal(fixture.host.popoverOpen, false);
  assert.equal(fixture.host.hasAttribute("popover"), false);
  assert.equal(fixture.host.hasAttribute("data-viewtune-window-host"), false);
  assert.equal(fixture.host.hasAttribute("data-viewtune-window-pending"), false);
  assert.equal(fixture.bridge.hasAttribute("data-viewtune-window-fill"), false);
  assert.equal(fixture.surface.hasAttribute("data-viewtune-window-frame"), false);
  assert.equal(fixture.video.hasAttribute("data-viewtune-window-video"), false);
  assert.equal(fixture.host.style.getPropertyValue("--viewtune-window-display"), "inline-grid");
  assert.equal(fixture.host.style.getPropertyPriority("--viewtune-window-display"), "important");
  assert.deepEqual(focusRestoreOptions, { preventScroll: true });
  assert.deepEqual(restoredScroll, [120, 340]);
});

test("V 호스트 탐색은 ID가 아니라 현재의 연속된 플레이어 프레임을 따라간다", () => {
  const fixture = anonymousPlayerFixture();
  const theaterHost = new FakeLayoutNode({ parentElement: fixture.root });
  const controller = new VideoController({
    documentRef: { documentElement: fixture.root, body: null, addEventListener() {} },
    windowRef: {}
  });

  assert.equal(controller.discoverPopoverHost(fixture.surface, fixture.video), fixture.host);
  theaterHost.append(fixture.host);
  assert.equal(controller.discoverPopoverHost(fixture.surface, fixture.video), theaterHost);
});

test("이름 없는 커스텀 컨트롤 클릭도 가까운 단일 video와 연결한다", () => {
  class Element {
    constructor(parentElement = null) {
      this.parentElement = parentElement;
      this.videos = [];
    }

    closest() {
      return null;
    }

    querySelectorAll(selector) {
      return selector === "video" ? this.videos : [];
    }
  }
  class Video extends Element {}

  const root = new Element();
  const surface = new Element(root);
  const control = new Element(surface);
  const video = new Video(surface);
  surface.videos = [video];
  const controller = new VideoController({
    documentRef: { documentElement: root, body: null, addEventListener() {} },
    windowRef: { Element, HTMLVideoElement: Video }
  });

  assert.equal(controller.videoFromElement(control), video);
});

test("기능 증거가 모호하거나 기존 Popover를 침범해야 하면 V는 아무것도 바꾸지 않는다", () => {
  const fixture = anonymousPlayerFixture();
  const intrusiveSibling = new FakeLayoutNode({ parentElement: fixture.bridge });
  fixture.surface.setAttribute("popover", "auto");
  const controller = new VideoController({
    documentRef: {
      documentElement: fixture.root,
      body: null,
      fullscreenElement: null,
      pictureInPictureElement: null,
      addEventListener() {}
    },
    windowRef: {}
  });

  assert.equal(controller.layoutPlanFor(fixture.surface, fixture.video), null);
  assert.equal(fixture.surface.getAttribute("popover"), "auto");
  assert.equal(intrusiveSibling.attributes.size, 0);

  fixture.surface.removeAttribute("popover");
  fixture.control.isConnected = false;
  assert.equal(controller.layoutPlanFor(fixture.surface, fixture.video), null);

  fixture.control.isConnected = true;
  controller.document.fullscreenElement = fixture.video;
  assert.equal(controller.layoutPlanFor(fixture.surface, fixture.video), null);

  controller.document.fullscreenElement = null;
  fixture.root.append(fixture.surface);
  assert.equal(controller.layoutPlanFor(fixture.surface, fixture.video), null);
});

test("V 검증은 Popover나 플레이어 컨트롤이 사라지면 실패 원인을 보고한다", () => {
  const fixture = anonymousPlayerFixture();
  const controller = new VideoController({
    documentRef: { documentElement: fixture.root, body: null, addEventListener() {} },
    windowRef: {
      innerWidth: 1920,
      innerHeight: 1080,
      getComputedStyle: () => ({ display: "block" })
    }
  });
  const layout = controller.activateWindowLayout({ surface: fixture.surface, video: fixture.video });
  const viewport = layoutRect(0, 0, 1920, 1080);
  fixture.host.box = viewport;
  fixture.bridge.box = viewport;
  fixture.surface.box = viewport;
  fixture.video.box = viewport;
  fixture.control.box = layoutRect(24, 1020, 120, 32);

  assert.equal(controller.layoutGeometryStatus(layout).reason, "control-layout-mismatch");
  fixture.rightControl.box = layoutRect(1776, 1020, 120, 32);
  assert.equal(controller.layoutGeometryStatus(layout).usable, true);
  fixture.control.box = layoutRect(24, 1020, 120, 0);
  assert.equal(controller.layoutGeometryStatus(layout).reason, "control-collapsed");
  fixture.control.isConnected = false;
  const replacementControl = new FakeLayoutNode({
    parentElement: fixture.surface,
    box: layoutRect(24, 1020, 120, 32),
    control: true
  });
  assert.equal(controller.reconcileControlWitnesses(layout), true);
  assert.equal(
    layout.controlWitnesses.some((witness) => witness.element === replacementControl),
    true
  );
  fixture.host.popoverOpen = false;
  assert.equal(controller.layoutGeometryStatus(layout).reason, "popover-closed");
  controller.setFeedbackEnabled(false);
  controller.activeWindowLayout = layout;
  fixture.host.dispatchEvent("toggle", { newState: "closed" });
  assert.equal(controller.activeWindowLayout, null);
  assert.equal(fixture.host.hasAttribute("popover"), false);
});

test("V 활성 중 native fullscreen이 시작되면 두 화면 모드를 겹치지 않고 원복한다", () => {
  const fixture = anonymousPlayerFixture();
  const listeners = new Map();
  const documentRef = {
    documentElement: fixture.root,
    body: null,
    fullscreenElement: null,
    pictureInPictureElement: null,
    activeElement: null,
    addEventListener(type, listener) {
      const values = listeners.get(type) || new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    }
  };
  const controller = new VideoController({
    documentRef,
    windowRef: { getComputedStyle: () => ({ display: "block" }) }
  });
  controller.setFeedbackEnabled(false);
  const layout = controller.activateWindowLayout({ surface: fixture.surface, video: fixture.video });
  controller.activeWindowLayout = layout;
  controller.observeWindowLayout(layout);

  documentRef.fullscreenElement = fixture.video;
  for (const listener of listeners.get("fullscreenchange") || []) {
    listener();
  }

  assert.equal(controller.activeWindowLayout, null);
  assert.equal(fixture.host.popoverOpen, false);
  assert.equal(fixture.host.hasAttribute("data-viewtune-window-host"), false);
});

test("V 활성 중 Document Picture-in-Picture가 열려도 즉시 원복한다", () => {
  const fixture = anonymousPlayerFixture();
  const documentPictureInPicture = new FakeLayoutNode();
  documentPictureInPicture.window = null;
  const controller = new VideoController({
    documentRef: { documentElement: fixture.root, body: null, addEventListener() {} },
    windowRef: {
      documentPictureInPicture,
      getComputedStyle: () => ({ display: "block" })
    }
  });
  controller.setFeedbackEnabled(false);
  const layout = controller.activateWindowLayout({ surface: fixture.surface, video: fixture.video });
  controller.activeWindowLayout = layout;
  controller.observeWindowLayout(layout);

  documentPictureInPicture.window = {};
  documentPictureInPicture.dispatchEvent("enter", {});

  assert.equal(controller.activeWindowLayout, null);
  assert.equal(fixture.host.popoverOpen, false);
  assert.equal(fixture.host.hasAttribute("data-viewtune-window-host"), false);
});

test("네이티브 controls 영상은 별도 조상만 Popover로 올려 fullscreen 가능성을 보존한다", () => {
  const root = new FakeLayoutNode();
  const host = new FakeLayoutNode({ parentElement: root });
  const video = new FakeLayoutNode({ parentElement: host, nativeControls: true });
  const controller = new VideoController({
    documentRef: { documentElement: root, body: null, addEventListener() {} },
    windowRef: { getComputedStyle: () => ({ display: "block" }) }
  });

  assert.equal(controller.playerSurfaceFor(video), video);
  const layout = controller.activateWindowLayout({ surface: video, video });
  assert.equal(layout.layoutElement, host);
  assert.equal(layout.fillElements.length, 0);
  assert.equal(host.popoverOpen, true);
  assert.equal(video.hasAttribute("popover"), false);
  controller.deactivateWindowLayout(layout);
  assert.equal(host.hasAttribute("popover"), false);

  root.append(video);
  assert.equal(controller.layoutPlanFor(video, video), null);
});

test("레이아웃 후 영상 높이가 0이면 성공 처리하지 않는다", () => {
  const rect = (width, height) => ({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height
  });
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });

  assert.equal(controller.isLayoutGeometryUsable({
    layoutElement: { isConnected: true, getBoundingClientRect: () => rect(1920, 1080) },
    surface: { isConnected: true },
    video: { isConnected: true, getBoundingClientRect: () => rect(1920, 0) }
  }), false);
});

test("창 맞춤은 호스트와 영상이 실제 viewport 대부분을 채워야 성공한다", () => {
  const rect = (left, top, width, height) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  });
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: { innerWidth: 1920, innerHeight: 1080 }
  });
  const layout = (hostRect, videoRect) => ({
    mode: constants.ACTIONS.WINDOW,
    layoutElement: { isConnected: true, getBoundingClientRect: () => hostRect },
    surface: { isConnected: true, getBoundingClientRect: () => hostRect },
    frameElement: { isConnected: true, getBoundingClientRect: () => hostRect },
    video: { isConnected: true, getBoundingClientRect: () => videoRect }
  });

  assert.equal(controller.isLayoutGeometryUsable(
    layout(rect(0, 0, 1920, 1080), rect(0, 0, 1920, 1080))
  ), true);
  assert.equal(controller.isLayoutGeometryUsable(
    layout(rect(0, 0, 1280, 720), rect(0, 0, 1280, 720))
  ), false);
  assert.equal(controller.isLayoutGeometryUsable(
    layout(rect(0, 0, 1920, 1080), rect(0, 0, 64, 48))
  ), false);
});

test("U는 현재 YouTube player rect를 바꾸지 않고 video만 cover 크기로 동기화한다", () => {
  const rect = (left, top, width, height) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  });
  const properties = new Map();
  const videoAttributes = new Map();
  let surfaceRect = rect(0, 0, 2560, 1080);
  const fullscreenElement = { id: "movie_player" };
  const surface = {
    id: "movie_player",
    isConnected: true,
    getBoundingClientRect: () => surfaceRect,
    hasAttribute: () => false
  };
  const video = {
    isConnected: true,
    videoWidth: 1920,
    videoHeight: 1080,
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    },
    setAttribute: (name, value) => videoAttributes.set(name, value),
    getAttribute: (name) => videoAttributes.get(name) || null,
    removeAttribute: (name) => videoAttributes.delete(name),
    getBoundingClientRect: () => rect(
      surfaceRect.left,
      surfaceRect.top,
      Number.parseFloat(properties.get("--viewtune-crop-width")) || 1600,
      Number.parseFloat(properties.get("--viewtune-crop-height")) || 900
    )
  };
  const documentRef = {
    addEventListener() {},
    fullscreenElement
  };
  const controller = new VideoController({
    documentRef,
    windowRef: {}
  });
  const originalSurfaceRect = controller.normalizedRect(surface);
  const crop = controller.activateWideCrop({ surface, video });

  assert.equal(crop.kind, "surface");
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), "surface");
  assert.equal(properties.get("--viewtune-crop-width"), "2560px");
  assert.equal(properties.get("--viewtune-crop-height"), "1080px");
  assert.deepEqual(controller.normalizedRect(surface), originalSurfaceRect);
  assert.equal(documentRef.fullscreenElement, fullscreenElement);
  assert.equal(controller.wideCropGeometryStatus(crop, originalSurfaceRect).usable, true);

  surfaceRect = rect(0, 0, 1920, 1080);
  assert.equal(controller.syncWideCropGeometry(crop), "dormant");
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), null);
  assert.equal(properties.size, 0);

  surfaceRect = rect(0, 0, 2560, 1080);
  assert.equal(controller.syncWideCropGeometry(crop), "applied");
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), "surface");
  assert.equal(properties.get("--viewtune-crop-width"), "2560px");
  assert.equal(properties.get("--viewtune-crop-height"), "1080px");

  controller.deactivateWideCrop(crop);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), null);
  assert.equal(properties.size, 0);
});

test("U는 같은 video의 metadata와 원본 비율이 바뀌면 확대를 다시 판단한다", () => {
  const rect = (width, height) => ({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height
  });
  const properties = new Map();
  const attributes = new Map();
  const videoListeners = new Map();
  const surface = {
    id: "movie_player",
    isConnected: true,
    getBoundingClientRect: () => rect(2560, 1080)
  };
  const video = {
    isConnected: true,
    videoWidth: 1920,
    videoHeight: 1080,
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) || null,
    removeAttribute: (name) => attributes.delete(name),
    addEventListener: (name, listener) => videoListeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (videoListeners.get(name) === listener) {
        videoListeners.delete(name);
      }
    }
  };
  const controller = new VideoController({
    documentRef: {
      addEventListener() {},
      removeEventListener() {}
    },
    windowRef: {
      addEventListener() {},
      removeEventListener() {}
    }
  });
  const crop = controller.activateWideCrop({ surface, video });
  controller.activeWideCrop = crop;
  controller.observeWideCrop(crop);

  assert.equal(crop.rendering, true);
  assert.equal(videoListeners.has("resize"), true);
  assert.equal(videoListeners.has("loadedmetadata"), true);

  video.videoWidth = 0;
  video.videoHeight = 0;
  videoListeners.get("resize")();
  assert.equal(crop.rendering, false);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), null);
  assert.equal(properties.size, 0);
  assert.equal(controller.activeWideCrop, crop);

  video.videoWidth = 2560;
  video.videoHeight = 1080;
  videoListeners.get("loadedmetadata")();
  assert.equal(crop.sourceAspect, 2560 / 1080);
  assert.equal(crop.rendering, false);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), null);
  assert.equal(properties.size, 0);
  assert.equal(controller.activeWideCrop, crop);

  video.videoWidth = 1920;
  video.videoHeight = 1080;
  videoListeners.get("resize")();
  assert.equal(crop.sourceAspect, 1920 / 1080);
  assert.equal(crop.rendering, true);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), "surface");

  controller.stopObservingWideCrop(crop);
  assert.equal(videoListeners.size, 0);
});

test("U는 화면 전환 중 surface가 접히면 표시만 걷고 복구 뒤 다시 적용한다", () => {
  const rect = (width, height) => ({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height
  });
  const properties = new Map();
  const attributes = new Map();
  let surfaceRect = rect(2560, 1080);
  const surface = {
    id: "movie_player",
    isConnected: true,
    getBoundingClientRect: () => surfaceRect
  };
  const video = {
    isConnected: true,
    videoWidth: 1920,
    videoHeight: 1080,
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) || null,
    removeAttribute: (name) => attributes.delete(name)
  };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  const crop = controller.activateWideCrop({ surface, video });
  controller.activeWideCrop = crop;

  surfaceRect = rect(0, 0);
  assert.equal(controller.syncWideCropGeometry(crop), "unavailable");
  assert.equal(crop.rendering, false);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), null);
  assert.equal(properties.size, 0);
  assert.equal(controller.activeWideCrop, crop);

  surfaceRect = rect(2560, 1080);
  assert.equal(controller.syncWideCropGeometry(crop), "applied");
  assert.equal(crop.rendering, true);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), "surface");
  assert.equal(properties.get("--viewtune-crop-width"), "2560px");
  assert.equal(properties.get("--viewtune-crop-height"), "1080px");
});

test("U는 일반 16:9 화면에서 video 위치와 크기를 건드리지 않는다", () => {
  const surfaceRect = { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
  const attributes = new Map();
  const properties = new Map();
  const video = {
    isConnected: true,
    playbackRate: 1,
    videoWidth: 1920,
    videoHeight: 1080,
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) || null,
    removeAttribute: (name) => attributes.delete(name)
  };
  const surface = {
    id: "movie_player",
    isConnected: true,
    getBoundingClientRect: () => surfaceRect
  };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  let feedback = "";
  controller.findVideo = () => video;
  controller.playerSurfaceFor = () => surface;
  controller.showToast = (message) => {
    feedback = message;
  };

  const result = controller.execute(constants.ACTIONS.WIDE);

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "already-fit");
  assert.equal(controller.activeWideCrop, null);
  assert.equal(video.getAttribute("data-viewtune-wide-crop"), null);
  assert.equal(properties.size, 0);
  assert.match(feedback, /확대할 여백이 없어요/);
});

test("U는 surface가 원본 영상보다 2% 이상 넓을 때만 crop이 필요하다고 판단한다", () => {
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  const video16By9 = { videoWidth: 1920, videoHeight: 1080 };
  const video21By9 = { videoWidth: 2520, videoHeight: 1080 };
  const surface = (width, height) => ({ width, height });

  assert.equal(controller.wideCropDemand(video16By9, surface(1800, 1000)).needed, false);
  assert.equal(controller.wideCropDemand(video16By9, surface(2560, 1080)).needed, true);
  assert.equal(controller.wideCropDemand(video21By9, surface(1920, 1080)).needed, false);
  assert.equal(controller.wideCropDemand({}, surface(2560, 1080)).reason, "metadata-unavailable");
});

test("V와 U는 동시에 켜지고 어느 하나를 꺼도 다른 상태를 유지한다", () => {
  const fullRect = { left: 0, top: 0, right: 2560, bottom: 1080, width: 2560, height: 1080 };
  const video = {
    isConnected: true,
    playbackRate: 1,
    videoWidth: 1920,
    videoHeight: 1080
  };
  const surface = { isConnected: true, getBoundingClientRect: () => fullRect };
  const windowLayout = { surface, video };
  let cropSequence = 0;
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  controller.cleanupDetachedState = () => {};
  controller.findVideo = () => video;
  controller.playerSurfaceFor = () => surface;
  controller.activateWindowLayout = () => windowLayout;
  controller.layoutGeometryStatus = () => ({ usable: true, reason: "ok" });
  controller.recordLayoutDiagnostic = () => {};
  controller.scheduleWindowLayoutValidation = () => {};
  controller.deactivateWindowLayout = () => {};
  controller.activateWideCrop = () => ({
    id: ++cropSequence,
    surface,
    video
  });
  controller.wideCropGeometryStatus = () => ({ usable: true, reason: "ok" });
  controller.observeWideCrop = () => {};
  controller.syncActiveWideCrop = () => true;
  controller.showToast = () => {};

  let result = controller.execute(constants.ACTIONS.WINDOW);
  assert.deepEqual(result.modes, { wide: false, window: true });
  const originalWindowLayout = controller.activeWindowLayout;

  result = controller.execute(constants.ACTIONS.WIDE);
  assert.deepEqual(result.modes, { wide: true, window: true });
  assert.equal(controller.activeWindowLayout, originalWindowLayout);

  result = controller.execute(constants.ACTIONS.WIDE);
  assert.deepEqual(result.modes, { wide: false, window: true });
  assert.equal(controller.activeWindowLayout, originalWindowLayout);

  controller.execute(constants.ACTIONS.WIDE);
  const originalWideCrop = controller.activeWideCrop;
  result = controller.execute(constants.ACTIONS.WINDOW);
  assert.deepEqual(result.modes, { wide: true, window: false });
  assert.equal(controller.activeWideCrop, originalWideCrop);
});

test("U가 먼저 켜진 상태에서 V를 켜고 꺼도 crop 크기는 현재 player를 다시 따른다", () => {
  const rect = (width, height) => ({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height
  });
  const properties = new Map();
  let surfaceRect = rect(2560, 1080);
  const surface = {
    id: "movie_player",
    isConnected: true,
    getBoundingClientRect: () => surfaceRect
  };
  const video = {
    isConnected: true,
    playbackRate: 1,
    videoWidth: 1920,
    videoHeight: 1080,
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    },
    setAttribute() {},
    removeAttribute() {},
    getBoundingClientRect: () => surfaceRect
  };
  const windowLayout = { surface, video };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  controller.cleanupDetachedState = () => {};
  controller.findVideo = () => video;
  controller.playerSurfaceFor = () => surface;
  controller.activeWideCrop = controller.activateWideCrop({ surface, video });
  controller.activateWindowLayout = () => {
    surfaceRect = rect(3000, 1200);
    return windowLayout;
  };
  controller.layoutGeometryStatus = () => ({ usable: true, reason: "ok" });
  controller.recordLayoutDiagnostic = () => {};
  controller.scheduleWindowLayoutValidation = () => {};
  controller.deactivateWindowLayout = () => {
    surfaceRect = rect(1280, 720);
  };
  controller.refreshStateObserver = () => {};
  controller.showToast = () => {};

  const crop = controller.activeWideCrop;
  let result = controller.execute(constants.ACTIONS.WINDOW);
  assert.deepEqual(result.modes, { wide: true, window: true });
  assert.equal(controller.activeWideCrop, crop);
  assert.equal(properties.get("--viewtune-crop-width"), "3000px");
  assert.equal(properties.get("--viewtune-crop-height"), "1200px");

  result = controller.execute(constants.ACTIONS.WINDOW);
  assert.deepEqual(result.modes, { wide: true, window: false });
  assert.equal(controller.activeWideCrop, crop);
  assert.equal(properties.size, 0);
  assert.equal(crop.rendering, false);
});

test("종료된 활성 영상도 상태에 남아 같은 키로 V와 U를 해제할 수 있다", () => {
  const endedVideo = { isConnected: true, ended: true, playbackRate: 1 };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  controller.cleanupDetachedState = () => {};
  controller.findVideo = () => null;
  controller.deactivateWindowLayout = () => {};
  controller.syncActiveWideCrop = () => true;
  controller.refreshStateObserver = () => {};
  controller.stopObservingWideCrop = () => {};
  controller.deactivateWideCrop = () => {};
  controller.showToast = () => {};
  controller.activeWindowLayout = { video: endedVideo };

  assert.deepEqual(controller.getStatus(), {
    found: true,
    rate: 1,
    modes: { wide: false, window: true },
    pendingModes: { wide: false, window: false }
  });
  let result = controller.execute(constants.ACTIONS.WINDOW);
  assert.equal(result.found, true);
  assert.deepEqual(result.modes, { wide: false, window: false });

  controller.activeWideCrop = { video: endedVideo };
  result = controller.execute(constants.ACTIONS.WIDE);
  assert.equal(result.found, true);
  assert.deepEqual(result.modes, { wide: false, window: false });
});

test("YouTube의 0 높이 media wrapper는 보이는 video를 실패로 오판하지 않는다", () => {
  const fullRect = { left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 };
  const zeroMediaRect = { left: 0, top: 0, right: 1920, bottom: 0, width: 1920, height: 0 };
  const mediaContainer = { getBoundingClientRect: () => zeroMediaRect };
  const surface = {
    isConnected: true,
    getBoundingClientRect: () => fullRect,
    querySelector: () => mediaContainer
  };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: { innerWidth: 1920, innerHeight: 1080 }
  });

  assert.equal(controller.isLayoutGeometryUsable({
    mode: constants.ACTIONS.WINDOW,
    layoutElement: { isConnected: true, getBoundingClientRect: () => fullRect },
    frameElement: surface,
    surface,
    video: { isConnected: true, getBoundingClientRect: () => fullRect }
  }), true);
});

test("다음 두 프레임 안에 영상 크기가 무너지면 활성 레이아웃을 자동 원복한다", () => {
  const callbacks = [];
  const fullRect = { left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 };
  const zeroRect = { left: 0, top: 0, right: 1920, bottom: 0, width: 1920, height: 0 };
  let videoRect = fullRect;
  let layoutAttributeRemoved = false;
  let feedback = "";
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {
      innerWidth: 1920,
      innerHeight: 1080,
      requestAnimationFrame(callback) {
        callbacks.push(callback);
        return callbacks.length;
      }
    }
  });
  const layout = {
    mode: constants.ACTIONS.WINDOW,
    layoutAttribute: "data-viewtune-layout",
    layoutElement: {
      isConnected: true,
      getBoundingClientRect: () => fullRect,
      removeAttribute() {
        layoutAttributeRemoved = true;
      }
    },
    surface: { isConnected: true },
    video: { isConnected: true, getBoundingClientRect: () => videoRect },
    fillElements: [],
    portal: null
  };
  controller.showToast = (message) => {
    feedback = message;
  };
  controller.activeWindowLayout = layout;

  controller.scheduleWindowLayoutValidation(layout);
  assert.deepEqual(controller.currentPendingModes(), { wide: false, window: true });
  videoRect = zeroRect;
  callbacks.shift()();
  callbacks.shift()();

  assert.equal(controller.activeWindowLayout, null);
  assert.deepEqual(controller.currentPendingModes(), { wide: false, window: false });
  assert.equal(layoutAttributeRemoved, true);
  assert.match(feedback, /원래 화면/);
});

test("연결된 player surface가 다른 경로로 옮겨지면 이전 속성을 정리한다", () => {
  const outer = {
    isConnected: true,
    removeAttribute() {}
  };
  const originalFill = {
    isConnected: true,
    parentElement: outer,
    removeAttribute() {}
  };
  const otherParent = { isConnected: true, parentElement: outer };
  const surface = {
    isConnected: true,
    parentElement: originalFill,
    removeAttribute() {}
  };
  const layout = {
    mode: constants.ACTIONS.WINDOW,
    layoutAttribute: "data-viewtune-window-host",
    layoutElement: outer,
    frameElement: surface,
    surface,
    video: { isConnected: true },
    fillElements: [originalFill],
    portal: null
  };
  const controller = new VideoController({
    documentRef: { addEventListener() {} },
    windowRef: {}
  });
  controller.activeWindowLayout = layout;
  surface.parentElement = otherParent;

  controller.cleanupDetachedState();

  assert.equal(controller.activeWindowLayout, null);
});
