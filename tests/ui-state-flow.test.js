"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const popupSource = readFileSync(path.join(__dirname, "../src/popup/popup.js"), "utf8");
const optionsSource = readFileSync(path.join(__dirname, "../src/options/options.js"), "utf8");

class FakeElement {
  constructor({ dataset = {}, disabled = false, kbd = null } = {}) {
    this.attributes = new Map();
    this.dataset = { ...dataset };
    this.disabled = disabled;
    this.hidden = false;
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
    if (selector === "[data-action]" && this.dataset.action) {
      return this;
    }
    if (selector === "[data-record-action]" && this.dataset.recordAction) {
      return this;
    }
    return null;
  }
}

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createPopupHarness(messageHandler) {
  const runtime = { buildId: "test-build", extensionId: "test-extension", manifestVersion: "1.0.0" };
  const controls = new FakeElement();
  const openOptions = new FakeElement();
  const rate = new FakeElement();
  const reloadTab = new FakeElement();
  const runtimeText = new FakeElement();
  const status = new FakeElement();
  const targetRateLabel = new FakeElement();
  const windowButton = new FakeElement({ dataset: { action: "window", mode: "window" } });
  const wideButton = new FakeElement({ dataset: { action: "wide", mode: "wide" } });
  const actionButtons = [windowButton, wideButton];
  const documentListeners = new Map();
  const timers = [];

  const document = {
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    querySelector(selector) {
      return {
        "#controls": controls,
        "#open-options": openOptions,
        "#rate": rate,
        "#reload-tab": reloadTab,
        "#runtime": runtimeText,
        "#status": status,
        "#target-rate-label": targetRateLabel
      }[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-action]") return actionButtons;
      if (selector === "[data-mode]") return [windowButton, wideButton];
      if (selector === "[data-shortcut-for]") return [];
      return [];
    }
  };

  const context = {
    chrome: {
      runtime: {
        id: runtime.extensionId,
        openOptionsPage() {},
        sendMessage(message) {
          return messageHandler(message, runtime);
        }
      },
      storage: { sync: { async get() { return {}; } } },
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
    ViewTune: undefined
  };
  context.ViewTune = {
    ACTIONS: {
      WIDE: "wide",
      WINDOW: "window",
      SPEED_DOWN: "speedDown",
      SPEED_UP: "speedUp",
      SPEED_TARGET: "speedTarget",
      SPEED_RESET: "speedReset"
    },
    BUILD_ID: runtime.buildId,
    STORAGE_KEY: "viewTuneSettings",
    defaultSettings: () => ({ shortcuts: {}, targetPlaybackRate: 2 }),
    localizeDocument() {},
    mergeSettings: () => ({ shortcuts: {}, targetPlaybackRate: 2 }),
    runtimeIdentity: () => runtime,
    runtimeIdentitiesEqual: (left, right) => (
      left?.buildId === right?.buildId
      && left?.extensionId === right?.extensionId
      && left?.manifestVersion === right?.manifestVersion
    ),
    shortcutLabel: () => "",
    t: (_key, _substitutions, fallback) => fallback
  };

  vm.runInNewContext(popupSource, context, { filename: "popup.js" });
  return { documentListeners, runtime, timers, windowButton };
}

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
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 80);

  harness.timers.shift().callback();
  await flushAsync();
  await flushAsync();

  assert.equal(harness.windowButton.dataset.active, "false");
  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "false");
});

test("진행 중이던 status 응답은 더 최신 popup 명령 상태를 덮지 않는다", async () => {
  let resolveStaleStatus;
  const staleStatus = new Promise((resolve) => {
    resolveStaleStatus = resolve;
  });
  let statusCalls = 0;
  let commandCalls = 0;
  const harness = createPopupHarness((message, runtime) => {
    if (message.type === "viewtune/tab-status") {
      statusCalls += 1;
      return statusCalls === 1
        ? currentVideoResult(runtime, false, false)
        : staleStatus;
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
  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "true");

  harness.timers.shift().callback();
  await flushAsync();
  assert.equal(statusCalls, 2);

  harness.documentListeners.get("click")({ target: harness.windowButton });
  await flushAsync();
  await flushAsync();
  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "false");

  resolveStaleStatus(currentVideoResult(harness.runtime, true, false));
  await flushAsync();
  await flushAsync();

  assert.equal(harness.windowButton.dataset.active, "false");
  assert.equal(harness.windowButton.getAttribute("aria-pressed"), "false");
});

test("options는 저장 설정을 읽기 전에는 입력을 연결하거나 저장하지 않는다", async () => {
  let resolveStoredSettings;
  const storedSettings = new Promise((resolve) => {
    resolveStoredSettings = resolve;
  });
  let saveCount = 0;
  const documentListeners = new Map();
  const main = new FakeElement();
  main.setAttribute("aria-busy", "true");
  const feedback = new FakeElement({ disabled: true });
  const note = new FakeElement();
  const restoreDefaults = new FakeElement({ disabled: true });
  const actions = ["wide", "window", "speedTarget", "speedDown", "speedUp", "speedReset"];
  const buttons = actions.map((action) => new FakeElement({
    dataset: { recordAction: action },
    disabled: true,
    kbd: new FakeElement()
  }));
  const labels = Object.fromEntries(actions.map((action) => [action, action]));
  const customSettings = {
    showFeedback: false,
    targetPlaybackRate: 2.5,
    shortcuts: Object.fromEntries(actions.map((action, index) => [action, { code: `Key${index}` }]))
  };
  const targetRate = new FakeElement({ disabled: true });
  targetRate.valueAsNumber = 2;

  const document = {
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    querySelector(selector) {
      return {
        main,
        "#show-feedback": feedback,
        "#recording-note": note,
        "#restore-defaults": restoreDefaults,
        "#target-playback-rate": targetRate
      }[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-record-action]" ? buttons : [];
    }
  };

  const context = {
    chrome: {
      storage: {
        sync: {
          get() { return storedSettings; },
          async set() { saveCount += 1; }
        }
      }
    },
    clearTimeout() {},
    document,
    setTimeout() { return 1; },
    ViewTune: {
      ACTION_LABELS: labels,
      ACTION_ORDER: actions,

      STORAGE_KEY: "viewTuneSettings",
      defaultSettings: () => ({ showFeedback: true, targetPlaybackRate: 2, shortcuts: {} }),
      localizeDocument() {},
      loadSettingsFromStorage: async (storageArea) => {
        const stored = await storageArea.get();
        return stored.viewTuneSettings || { showFeedback: true, targetPlaybackRate: 2, shortcuts: {} };
      },
      mergeSettings: (candidate) => candidate || { showFeedback: true, targetPlaybackRate: 2, shortcuts: {} },
      normalizeTargetPlaybackRate: (rate) => rate,
      shortcutFromEvent: () => null,
      shortcutLabel: (shortcut) => shortcut.code,
      shortcutsEqual: () => false,
      usesPreviousDefaultPreset: () => false,
      t: (_key, _substitutions, fallback) => fallback
    }
  };

  vm.runInNewContext(optionsSource, context, { filename: "options.js" });

  documentListeners.get("click")?.({ target: buttons[0] });
  feedback.listeners.get("change")?.();
  assert.equal(saveCount, 0);
  assert.equal(documentListeners.has("click"), false);
  assert.equal(buttons.every((button) => button.disabled), true);

  resolveStoredSettings({ viewTuneSettings: customSettings });
  await flushAsync();
  await flushAsync();

  assert.equal(documentListeners.has("click"), true);
  assert.equal(main.getAttribute("aria-busy"), "false");
  assert.equal(buttons.every((button) => !button.disabled), true);
  assert.equal(feedback.disabled, false);
  assert.equal(targetRate.disabled, false);
  assert.equal(feedback.checked, false);
  assert.equal(targetRate.value, "2.5");
  assert.equal(buttons[0].kbd.textContent, "Key0");
  assert.equal(saveCount, 0);
});

function currentVideoResult(runtime, windowActive, windowPending) {
  return {
    found: true,
    ok: true,
    rate: 1,
    modes: { wide: false, window: windowActive },
    pendingModes: { wide: false, window: windowPending },
    runtime
  };
}
