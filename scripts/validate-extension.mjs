import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const constantsSource = await readFile(path.join(projectRoot, "src/shared/constants.js"), "utf8");
const popupSource = await readFile(path.join(projectRoot, manifest.action.default_popup), "utf8");
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
assertEqual(manifest.default_locale, "en", "기본 확장 언어는 영어여야 합니다.");
assertEqual(manifest.options_page, undefined, "설정은 별도 페이지가 아니라 팝업에 통합되어야 합니다.");
assertTruthy(popupSource.includes("settings-panel.js"), "팝업 설정 컨트롤러가 필요합니다.");
assertTruthy(manifest.background?.service_worker, "서비스 워커 경로가 필요합니다.");
assertTruthy(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, "content script가 필요합니다.");

const contentScript = manifest.content_scripts[0];
assertEqual(contentScript.all_frames, true, "iframe 비디오를 위해 all_frames가 필요합니다.");
assertEqual(contentScript.match_origin_as_fallback, true, "about: 및 blob iframe fallback이 필요합니다.");

const referencedFiles = [
  manifest.action.default_popup,
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

const localeCodes = ["en", "ko"];
const catalogs = Object.fromEntries(await Promise.all(localeCodes.map(async (locale) => {
  const localePath = path.join(projectRoot, "_locales", locale, "messages.json");
  const catalog = JSON.parse(await readFile(localePath, "utf8"));
  return [locale, catalog];
})));
const defaultMessageKeys = Object.keys(catalogs.en).sort();
assertTruthy(defaultMessageKeys.length > 0, "영어 메시지 카탈로그가 비어 있습니다.");

for (const locale of localeCodes) {
  const messageKeys = Object.keys(catalogs[locale]).sort();
  assertEqual(
    JSON.stringify(messageKeys),
    JSON.stringify(defaultMessageKeys),
    `${locale} 메시지 키가 기본 영어 카탈로그와 같아야 합니다.`
  );
  for (const key of defaultMessageKeys) {
    const entry = catalogs[locale][key];
    assertTruthy(typeof entry?.message === "string" && entry.message.length > 0, `${locale}.${key} 메시지가 필요합니다.`);
    const expectedPlaceholders = Object.keys(catalogs.en[key].placeholders || {}).sort();
    const actualPlaceholders = Object.keys(entry.placeholders || {}).sort();
    assertEqual(
      JSON.stringify(actualPlaceholders),
      JSON.stringify(expectedPlaceholders),
      `${locale}.${key} placeholder가 영어 카탈로그와 같아야 합니다.`
    );
  }
}

const sourceFiles = await walkFiles(path.join(projectRoot, "src"));
const referencedMessageKeys = new Set();
collectManifestMessageKeys(manifest, referencedMessageKeys);
for (const sourcePath of sourceFiles.filter((filePath) => /\.(?:html|js)$/.test(filePath))) {
  const source = await readFile(sourcePath, "utf8");
  for (const pattern of [
    /\b(?:t|message)(?:\?\.)?\(\s*"([A-Za-z0-9_]+)"/g,
    /data-i18n(?:-aria-label|-placeholder)?="([A-Za-z0-9_]+)"/g
  ]) {
    for (const match of source.matchAll(pattern)) {
      referencedMessageKeys.add(match[1]);
    }
  }
}

for (const key of referencedMessageKeys) {
  assertTruthy(catalogs.en[key], `참조된 영어 메시지 키가 없습니다: ${key}`);
}

console.log(
  `Manifest 검증 완료: ${referencedFiles.length}개 파일, ${defaultMessageKeys.length}개 다국어 메시지 확인`
);

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
}

function collectManifestMessageKeys(value, result) {
  if (typeof value === "string") {
    const match = value.match(/^__MSG_([A-Za-z0-9_]+)__$/);
    if (match) result.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectManifestMessageKeys(item, result));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectManifestMessageKeys(item, result));
  }
}

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
