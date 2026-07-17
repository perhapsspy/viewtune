"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const css = readFileSync(
  path.join(__dirname, "../src/content/content.css"),
  "utf8"
);

test("V Popover 호스트는 저장한 display를 유지하며 viewport를 채운다", () => {
  const hostRule = css.match(
    /\[data-viewtune-window-host="window"\]\s*\{([^}]+)\}/
  )?.[1] || "";

  assert.match(hostRule, /position:\s*fixed\s*!important/);
  assert.match(hostRule, /inset:\s*0\s*!important/);
  assert.match(hostRule, /display:\s*var\(--viewtune-window-display, block\)\s*!important/);
  assert.match(hostRule, /width:\s*100vw\s*!important/);
  assert.match(hostRule, /height:\s*100vh\s*!important/);
  assert.match(hostRule, /overflow:\s*hidden\s*!important/);
});

test("V는 검증 전 중간 상태를 숨기고 Popover backdrop은 입력을 가로채지 않는다", () => {
  const pendingRule = css.match(
    /\[data-viewtune-window-host\]\[data-viewtune-window-pending\]\s*\{([^}]+)\}/
  )?.[1] || "";
  const backdropRule = css.match(
    /\[data-viewtune-window-host\]::backdrop\s*\{([^}]+)\}/
  )?.[1] || "";

  assert.match(pendingRule, /visibility:\s*hidden\s*!important/);
  assert.match(backdropRule, /background:\s*transparent\s*!important/);
  assert.match(backdropRule, /pointer-events:\s*none\s*!important/);
});

test("플레이어 frame은 위치나 z축을 바꾸지 않고 호스트 크기만 상속한다", () => {
  const frameRule = css.match(
    /\[data-viewtune-window-fill\],\s*\[data-viewtune-window-frame\]\s*\{([^}]+)\}/
  )?.[1] || "";

  assert.match(frameRule, /width:\s*100%\s*!important/);
  assert.match(frameRule, /height:\s*100%\s*!important/);
  assert.doesNotMatch(frameRule, /position|transform|z-index|inset/);
});

test("V 영상 배치는 사이트 클래스 없이 전용 상태 속성만 사용한다", () => {
  const videoRule = css.match(
    /video\[data-viewtune-window-video\]\s*\{([^}]+)\}/
  )?.[1] || "";

  assert.match(videoRule, /width:\s*100vw\s*!important/);
  assert.match(videoRule, /height:\s*100vh\s*!important/);
  assert.match(videoRule, /object-fit:\s*contain\s*!important/);
  assert.doesNotMatch(css, /data-viewtune-youtube-(?:layout|fill|frame)/);
  assert.doesNotMatch(css, /video\.html5-main-video/);
});

test("B는 host를 만들지 않고 현재 video 표시 박스에만 cover crop을 적용한다", () => {
  const commonCropRule = css.match(
    /video\[data-viewtune-wide-crop\]\s*\{([^}]+)\}/
  )?.[1] || "";
  const surfaceCropRule = css.match(
    /video\[data-viewtune-wide-crop="surface"\]\s*\{([^}]+)\}/
  )?.[1] || "";

  assert.doesNotMatch(css, /\[data-viewtune-(?:youtube-)?layout="wide"\]/);
  assert.match(commonCropRule, /object-fit:\s*cover\s*!important/);
  assert.match(commonCropRule, /object-position:\s*center\s*!important/);
  assert.doesNotMatch(
    commonCropRule,
    /(?:^|\n)\s*(?:position|inset|z-index|margin|aspect-ratio|transform|left|top|width|height|max-width|max-height)\s*:/
  );
  assert.match(surfaceCropRule, /width:\s*var\(--viewtune-crop-width\)\s*!important/);
  assert.match(surfaceCropRule, /height:\s*var\(--viewtune-crop-height\)\s*!important/);
});

test("사이트별 선택자는 컨트롤 바의 선택적 외형 보정에만 남는다", () => {
  const controlRule = css.match(
    /\[data-viewtune-window-frame\]\s+\.ytp-chrome-bottom\s*\{([^}]+)\}/
  )?.[1] || "";

  assert.match(controlRule, /right:\s*12px\s*!important/);
  assert.match(controlRule, /width:\s*auto\s*!important/);
  assert.doesNotMatch(css, /\.html5-video-container\s*\{/);
});
