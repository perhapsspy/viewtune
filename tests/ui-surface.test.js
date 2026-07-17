"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const manifest = JSON.parse(read("manifest.json"));
const packageJson = JSON.parse(read("package.json"));
const readme = read("README.md");
const popupHtml = read("src/popup/popup.html");
const popupCss = read("src/popup/popup.css");
const popupJs = read("src/popup/popup.js");
const settingsJs = read("src/popup/settings-panel.js");
const themeCss = read("src/shared/theme.css");
const constantsJs = read("src/shared/constants.js");
const enMessages = JSON.parse(read("_locales/en/messages.json"));
const koMessages = JSON.parse(read("_locales/ko/messages.json"));

test("공개 UI와 런타임 식별자는 모두 ViewTune을 사용한다", () => {
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extensionName__");
  assert.equal(manifest.action.default_title, "__MSG_actionTitle__");
  assert.match(enMessages.extensionName.message, /^ViewTune\b/);
  assert.match(koMessages.extensionName.message, /^ViewTune\b/);
  assert.equal(manifest.icons[128], "assets/icons/icon-128.png");
  assert.equal(manifest.action.default_icon[16], "assets/icons/icon-16.png");
  assert.match(popupHtml, /<title data-i18n="popupTitle">ViewTune<\/title>/);
  assert.match(constantsJs, /const STORAGE_KEY = "viewTuneSettings"/);
  assert.equal(packageJson.version, manifest.version);
  assert.match(readme, new RegExp(`v${manifest.version.replaceAll(".", "\\.")}`));
});

test("정적 content script 범위와 Netflix 도메인 정책 파일을 사용한다", () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["http://*/*", "https://*/*"]);
  assert.ok(manifest.content_scripts[0].js.indexOf("src/content/site-policy.js")
    < manifest.content_scripts[0].js.indexOf("src/content/video-controller.js"));
});

test("popup은 300px 단일 셸에서 조작 화면과 설정 화면을 교체한다", () => {
  assert.equal(manifest.options_page, undefined);
  assert.match(popupHtml, /settings-panel\.js[\s\S]+popup\.js/);
  assert.match(popupHtml, /id="control-view"/);
  assert.match(popupHtml, /id="settings-view"[^>]+hidden/);
  assert.match(popupJs, /elements\.controlView\.hidden = state\.settingsVisible/);
  assert.match(popupJs, /elements\.settingsView\.hidden = !state\.settingsVisible/);
  assert.match(popupCss, /body\s*\{\s*width: 300px/);
  assert.match(themeCss, /--vt-color-accent:/);
  assert.match(themeCss, /prefers-reduced-motion: reduce/);
});

test("기본 화면은 수치·키캡·도형으로 여섯 동작과 상태를 압축한다", () => {
  assert.equal((popupHtml.match(/data-action="/g) || []).length, 6);
  assert.equal((popupHtml.match(/aria-pressed="false"/g) || []).length, 3);
  assert.match(popupHtml, /data-action="speedDown"[\s\S]+−\.5/);
  assert.match(popupHtml, /data-action="speedUp"[\s\S]+\+\.5/);
  assert.match(popupHtml, /data-action="wide"[\s\S]+21:9/);
  assert.match(popupHtml, /id="rate"[^>]+aria-live="polite"/);
  assert.match(popupJs, /setAttribute\("aria-pressed", String\(active\)\)/);
  assert.match(popupCss, /font-variant-numeric: tabular-nums/);
  assert.match(popupCss, /@media \(forced-colors: active\)/);
});

test("설정 화면은 별도 페이지 없이 키·목표 속도·피드백·초기화를 모두 제공한다", () => {
  assert.equal((popupHtml.match(/data-record-action="/g) || []).length, 6);
  assert.equal((popupHtml.match(/data-setting-action="/g) || []).length, 2);
  assert.match(
    popupHtml,
    /class="target-action-card"[\s\S]+data-record-action="speedTarget"[\s\S]+id="target-playback-rate"/
  );
  const shortcutGrid = popupHtml.slice(popupHtml.indexOf("class=\"shortcut-grid\""));
  assert.equal((shortcutGrid.match(/data-record-action="/g) || []).length, 5);
  assert.doesNotMatch(shortcutGrid, /data-record-action="speedTarget"/);
  assert.match(popupCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(popupHtml, /id="show-feedback"/);
  assert.match(popupHtml, /id="restore-defaults"/);
  assert.match(settingsJs, /loadSettingsFromStorage\(this\.storageArea, \{ migrate: true \}\)/);
  assert.match(settingsJs, /this\.storageArea\.set\(\{ \[STORAGE_KEY\]: this\.settings \}\)/);
  assert.match(settingsJs, /shortcutFromEvent\(event\)/);
  assert.equal(Object.keys(enMessages).some((key) => key.startsWith("options")), false);
  assert.equal(Object.keys(koMessages).some((key) => key.startsWith("options")), false);
  assert.equal(enMessages.settingsTargetMappingAria.message, "Target speed shortcut and playback speed");
  assert.equal(koMessages.settingsTargetMappingAria.message, "목표 속도 단축키와 재생 속도");
});

test("빌드 진단은 정상 상태에서 숨고 설치 버전은 항상 표시된다", () => {
  assert.match(popupHtml, /id="runtime" class="runtime" hidden/);
  assert.match(popupHtml, /id="installed-version"[^>]+>v—<\/p>/);
  assert.match(popupJs, /if \(!pageRuntime \|\| isCurrentRuntime\(pageRuntime\)\)/);
  assert.match(popupJs, /elements\.runtime\.hidden = false/);
  assert.match(popupJs, /elements\.installedVersion\.textContent = `v\$\{version\}`/);
});
