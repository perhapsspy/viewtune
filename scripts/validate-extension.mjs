import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const constantsSource = await readFile(path.join(projectRoot, "src/shared/constants.js"), "utf8");
const buildId = constantsSource.match(/const BUILD_ID = "([^"]+)";/)?.[1];

assertEqual(manifest.manifest_version, 3, "Manifest V3여야 합니다.");
assertEqual(packageJson.version, manifest.version, "package와 manifest 버전이 같아야 합니다.");
assertTruthy(buildId, "진단용 BUILD_ID가 필요합니다.");
assertTruthy(buildId.startsWith(`${manifest.version}-`), "BUILD_ID는 manifest 버전으로 시작해야 합니다.");
assertTruthy(manifest.minimum_chrome_version, "최소 Chrome 버전이 필요합니다.");
assertTruthy(
  Number.parseInt(manifest.minimum_chrome_version, 10) >= 114,
  "Popover top layer를 위해 Chrome 114 이상이 필요합니다."
);
assertTruthy(manifest.action?.default_popup, "팝업 경로가 필요합니다.");
assertTruthy(manifest.options_page, "설정 화면 경로가 필요합니다.");
assertTruthy(manifest.background?.service_worker, "서비스 워커 경로가 필요합니다.");
assertTruthy(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, "content script가 필요합니다.");

const contentScript = manifest.content_scripts[0];
assertEqual(contentScript.all_frames, true, "iframe 비디오를 위해 all_frames가 필요합니다.");
assertEqual(contentScript.match_origin_as_fallback, true, "about: 및 blob iframe fallback이 필요합니다.");

const referencedFiles = [
  manifest.action.default_popup,
  manifest.options_page,
  manifest.background.service_worker,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action.default_icon || {}),
  ...contentScript.js,
  ...contentScript.css
];

await Promise.all(referencedFiles.map(async (relativePath) => {
  try {
    await access(path.join(projectRoot, relativePath));
  } catch {
    throw new Error(`Manifest가 참조한 파일을 찾지 못했습니다: ${relativePath}`);
  }
}));

console.log(`Manifest 검증 완료: ${referencedFiles.length}개 참조 파일 확인`);

function assertTruthy(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (현재: ${String(actual)})`);
  }
}
