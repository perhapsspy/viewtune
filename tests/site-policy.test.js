"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const sitePolicySource = readFileSync(path.join(root, "src/content/site-policy.js"), "utf8");
const mainSource = readFileSync(path.join(root, "src/content/main.js"), "utf8");

function loadSitePolicy() {
  const context = {
    module: { exports: {} },
    ViewTune: {
      t: (_key, _substitutions, fallback) => fallback
    }
  };
  vm.runInNewContext(sitePolicySource, context, { filename: "site-policy.js" });
  return context.module.exports;
}

test("Netflix 도메인만 얇게 차단하고 다른 사이트는 그대로 허용한다", () => {
  const { pageCapability } = loadSitePolicy();

  assert.equal(pageCapability({ hostname: "netflix.com" }).supported, false);
  assert.equal(pageCapability({ hostname: "www.netflix.com" }).supported, false);
  assert.equal(pageCapability({ hostname: "assets.netflix.com" }).supported, false);
  assert.equal(pageCapability({ hostname: "netflix.example.com" }).supported, true);
  assert.equal(pageCapability({ hostname: "www.youtube.com" }).supported, true);
  assert.equal(pageCapability({ hostname: "laftel.net" }).supported, true);
});

test("차단 결과는 영상 없음과 구분되는 안정된 상태 계약을 제공한다", () => {
  const { pageCapability, unsupportedPageResult } = loadSitePolicy();
  const result = unsupportedPageResult(pageCapability({ hostname: "www.netflix.com" }));

  assert.equal(result.supported, false);
  assert.equal(result.found, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported-site");
  assert.equal(result.rate, null);
  assert.equal(result.modes.wide, false);
  assert.equal(result.modes.window, false);
});

test("Netflix에서는 VideoController와 단축키 리스너를 만들지 않고 상태·명령만 거절한다", () => {
  let controllerCreations = 0;
  let shortcutCreations = 0;
  let messageListener;
  const context = {
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) { messageListener = listener; }
        },
        sendMessage() { return Promise.resolve(); }
      }
    },
    document: {
      location: { hostname: "www.netflix.com" },
      documentElement: { setAttribute() {} },
      addEventListener() {
        throw new Error("차단 페이지에는 DOM 리스너를 연결하면 안 됩니다.");
      }
    },
    ViewTune: {
      BUILD_ID: "test-build",
      pageCapability: () => ({ supported: false, reason: "unsupported-site" }),
      runtimeIdentity: () => ({ buildId: "test-build" }),
      unsupportedPageResult: () => ({
        supported: false,
        found: false,
        ok: false,
        rate: null,
        modes: { wide: false, window: false },
        pendingModes: { wide: false, window: false },
        reason: "unsupported-site",
        message: "unavailable"
      }),
      VideoController: class {
        constructor() { controllerCreations += 1; }
      },
      ShortcutController: class {
        constructor() { shortcutCreations += 1; }
      }
    }
  };

  vm.runInNewContext(mainSource, context, { filename: "main.js" });
  assert.equal(controllerCreations, 0);
  assert.equal(shortcutCreations, 0);

  for (const type of ["viewtune/status", "viewtune/execute"]) {
    let response;
    messageListener({ type, action: "speedUp" }, {}, (value) => { response = value; });
    assert.equal(response.supported, false);
    assert.equal(response.reason, "unsupported-site");
  }
});
