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
const optionsHtml = read("src/options/options.html");
const optionsJs = read("src/options/options.js");
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
  assert.match(optionsHtml, /<title data-i18n="optionsTitle">ViewTune 설정<\/title>/);
  assert.match(constantsJs, /const STORAGE_KEY = "viewTuneSettings"/);

  assert.equal(packageJson.version, manifest.version);
  assert.match(readme, new RegExp(`v${manifest.version.replaceAll(".", "\\.")}`));

});

test("정적 content script 범위만 사용하고 중복 host_permissions는 요청하지 않는다", () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["http://*/*", "https://*/*"]);
});
test("popup과 options는 하나의 공통 디자인 토큰을 먼저 불러온다", () => {
  assert.match(popupHtml, /theme\.css[\s\S]+popup\.css/);
  assert.match(optionsHtml, /theme\.css[\s\S]+options\.css/);
  assert.match(themeCss, /--vt-color-accent:/);
  assert.match(themeCss, /prefers-reduced-motion: reduce/);
});

test("popup은 속도 중심 계층과 접근 가능한 화면 모드 상태를 제공한다", () => {
  assert.match(popupHtml, /class="speed-panel"/);
  assert.match(popupHtml, /id="rate"[^>]+aria-live="polite"/);
  assert.equal((popupHtml.match(/aria-pressed="false"/g) || []).length, 2);
  assert.match(popupJs, /setAttribute\("aria-pressed", String\(active\)\)/);
  assert.match(popupCss, /font-variant-numeric: tabular-nums/);
  assert.match(popupCss, /@media \(forced-colors: active\)/);
  assert.match(popupHtml, /data-action="speedTarget"/);
  assert.match(popupHtml, /data-shortcut-for="speedTarget">G</);
  assert.match(popupJs, /단축키 \$\{shortcutLabel\(state\.settings\.shortcuts\[action\]\)\}/);
});

test("빌드 진단은 정상 상태에서 숨고 런타임 불일치에만 나타난다", () => {
  assert.match(popupHtml, /id="runtime" class="runtime" hidden/);
  assert.match(popupJs, /if \(!pageRuntime \|\| isCurrentRuntime\(pageRuntime\)\)/);
  assert.match(popupJs, /elements\.runtime\.hidden = false/);
});

test("설치 버전은 popup과 options 하단에 manifest 값으로 항상 표시된다", () => {
  assert.match(popupHtml, /id="installed-version"[^>]+>v—<\/p>/);
  assert.match(optionsHtml, /id="installed-version"[^>]+>ViewTune v—<\/footer>/);
  assert.match(popupJs, /elements\.installedVersion\.textContent = `v\$\{version\}`/);
  assert.match(optionsJs, /elements\.installedVersion\.textContent = `ViewTune v\$\{version\}`/);
  assert.match(optionsJs, /runtimeIdentity\(chrome\.runtime\)/);
});

test("단축키 설정은 평상시 안내와 녹음 상태를 구분한다", () => {
  assert.match(optionsHtml, /키 버튼을 선택하면 새 단축키를 입력할 수 있습니다/);
  assert.match(optionsJs, /button\.dataset\.recording = String\(recordingAction === action\)/);
  assert.match(optionsJs, /setAttribute\("aria-pressed", String\(recordingAction === action\)\)/);
});

test("단축키 설정은 저장값 로드가 끝난 뒤에만 상호작용을 연다", () => {
  assert.equal((optionsHtml.match(/ disabled/g) || []).length, 9);
  assert.match(optionsHtml, /<main aria-busy="true">/);
  assert.match(optionsJs, /await loadSettings\(\);\s*render\(\);\s*bindEvents\(\);\s*setInteractive\(true\);/);
});
