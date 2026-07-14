"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const popupSource = readFileSync(path.join(__dirname, "../src/popup/popup.js"), "utf8");
const workerSource = readFileSync(
  path.join(__dirname, "../src/background/service-worker.js"),
  "utf8"
);

test("popup은 U와 V의 복수 상태만 독립적으로 표시한다", () => {
  assert.match(popupSource, /renderModes\(result\.modes\)/);
  assert.match(popupSource, /const active = modes\[button\.dataset\.mode\] === true/);
  assert.match(popupSource, /setAttribute\("aria-pressed", String\(active\)\)/);
  assert.match(popupSource, /result\.pendingModes\?\.\[ACTIONS\.WINDOW\]/);
  assert.match(popupSource, /isCurrentRequest\(requestRevision\)/);
  assert.doesNotMatch(popupSource, /result\.mode\b/);
});

test("수신기 없음 응답도 U와 V의 비활성 복수 상태를 제공한다", () => {
  assert.match(workerSource, /modes:\s*\{\s*wide:\s*false,\s*window:\s*false\s*\}/);
  assert.match(workerSource, /pendingModes:\s*\{\s*wide:\s*false,\s*window:\s*false\s*\}/);
  assert.doesNotMatch(workerSource, /\bmode:\s*null/);
});
