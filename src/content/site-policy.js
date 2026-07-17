(() => {
  "use strict";

  const BLOCKED_HOST = "netflix.com";

  function pageCapability(locationRef = globalThis.location) {
    const hostname = hostnameFrom(locationRef);
    const blocked = hostname === BLOCKED_HOST || hostname.endsWith(`.${BLOCKED_HOST}`);
    return blocked
      ? { supported: false, reason: "unsupported-site" }
      : { supported: true, reason: null };
  }

  function unsupportedPageResult(capability = pageCapability()) {
    return {
      supported: false,
      found: false,
      ok: false,
      rate: null,
      modes: { wide: false, window: false },
      pendingModes: { wide: false, window: false },
      reason: capability.reason || "unsupported-site",
      message: globalThis.ViewTune.t(
        "contentSiteUnavailable",
        undefined,
        "이 사이트에서는 ViewTune 조작을 사용할 수 없어요."
      )
    };
  }

  function hostnameFrom(locationRef) {
    try {
      return String(locationRef?.hostname || "").trim().toLowerCase();
    } catch {
      return "";
    }
  }

  Object.assign(globalThis.ViewTune, {
    pageCapability,
    unsupportedPageResult
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { pageCapability, unsupportedPageResult };
  }
})();
