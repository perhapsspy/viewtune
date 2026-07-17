(() => {
  "use strict";

  const {
    BUILD_ID,
    pageCapability,
    runtimeIdentity,
    unsupportedPageResult
  } = globalThis.ViewTune;
  const capability = pageCapability(document.location);
  const controller = capability.supported
    ? new globalThis.ViewTune.VideoController()
    : null;
  let shortcuts = null;
  let contextActive = true;
  let runtimeMessageListener = null;
  markRuntimeBuild();

  const markFrameActive = () => {
    if (!contextActive) {
      return;
    }
    try {
      const pending = chrome.runtime.sendMessage({ type: "viewtune/activate-frame" });
      pending?.catch?.((error) => {
        if (isExtensionContextInvalidated(error)) {
          deactivateContext();
        }
      });
    } catch {
      deactivateContext();
    }
  };
  const handlePointerDown = (event) => {
    if (controller.videoFromElement(event.target)) {
      markFrameActive();
    }
  };
  const handlePlay = (event) => {
    if (controller.isUsableVideo(event.target)) {
      markFrameActive();
    }
  };

  if (controller) {
    activateController();
  }

  runtimeMessageListener = (message, _sender, sendResponse) => {
    if (message?.type === "viewtune/execute") {
      const result = controller
        ? controller.execute(message.action)
        : unsupportedPageResult(capability);
      if (result.found) {
        markFrameActive();
      }
      sendResponse(withPageContext(result));
      return;
    }

    if (message?.type === "viewtune/status") {
      const result = controller
        ? controller.getStatus()
        : unsupportedPageResult(capability);
      sendResponse(withPageContext(result));
    }
  };
  try {
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
  } catch {
    deactivateContext();
  }

  function activateController() {
    shortcuts = new globalThis.ViewTune.ShortcutController(controller, markFrameActive);
    try {
      shortcuts.start();
      document.addEventListener("pointerdown", handlePointerDown, true);
      document.addEventListener("play", handlePlay, true);
    } catch {
      deactivateContext();
    }
  }

  function deactivateContext() {
    if (!contextActive) {
      return;
    }
    contextActive = false;
    shortcuts?.stop?.();
    if (controller) {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("play", handlePlay, true);
    }
    try {
      if (runtimeMessageListener) {
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      }
    } catch {
      // 무효화된 컨텍스트에서는 Chrome 이벤트 자체에 접근할 수 없다.
    }
  }

  function isExtensionContextInvalidated(error) {
    return /extension context invalidated/i.test(String(error?.message || error || ""));
  }

  function withPageContext(result) {
    return {
      ...result,
      supported: capability.supported,
      runtime: runtimeIdentity(chrome.runtime)
    };
  }

  function markRuntimeBuild() {
    const mark = () => document.documentElement?.setAttribute("data-viewtune-build", BUILD_ID);
    mark();
    if (!document.documentElement) {
      document.addEventListener("readystatechange", mark, { once: true });
    }
  }
})();
