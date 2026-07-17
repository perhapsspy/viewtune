(() => {
  "use strict";

  const viewTune = (globalThis.ViewTune = globalThis.ViewTune || {});

  function t(key, substitutions, fallback = "") {
    try {
      const message = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
      if (message) {
        return message;
      }
    } catch {
      // 확장 i18n API가 없는 테스트·일반 문서에서는 제공된 fallback을 쓴다.
    }
    return fallback || key;
  }

  function localizeDocument(documentRef = globalThis.document) {
    if (!documentRef?.documentElement) {
      return;
    }

    let language = "en";
    try {
      language = globalThis.chrome?.i18n?.getUILanguage?.() || language;
    } catch {
      // 기본 언어를 유지한다.
    }
    documentRef.documentElement.lang = language.toLowerCase().startsWith("ko") ? "ko" : "en";

    for (const element of documentRef.querySelectorAll?.("[data-i18n]") || []) {
      element.textContent = t(element.dataset.i18n, undefined, element.textContent);
    }
    for (const element of documentRef.querySelectorAll?.("[data-i18n-aria-label]") || []) {
      element.setAttribute(
        "aria-label",
        t(element.dataset.i18nAriaLabel, undefined, element.getAttribute("aria-label") || "")
      );
    }
    for (const element of documentRef.querySelectorAll?.("[data-i18n-placeholder]") || []) {
      element.setAttribute(
        "placeholder",
        t(element.dataset.i18nPlaceholder, undefined, element.getAttribute("placeholder") || "")
      );
    }
  }

  Object.assign(viewTune, { localizeDocument, t });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { localizeDocument, t };
  }
})();
