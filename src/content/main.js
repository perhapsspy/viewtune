(() => {
  "use strict";

  const { BUILD_ID, runtimeIdentity } = globalThis.ViewTune;
  const controller = new globalThis.ViewTune.VideoController();
  markRuntimeBuild();
  const markFrameActive = () => {
    chrome.runtime.sendMessage({ type: "viewtune/activate-frame" }).catch(() => {
      // 서비스 워커가 다시 시작되는 짧은 순간에도 영상 제어는 독립적으로 동작한다.
    });
  };

  const shortcuts = new globalThis.ViewTune.ShortcutController(controller, markFrameActive);
  shortcuts.start();

  document.addEventListener("pointerdown", (event) => {
    if (controller.videoFromElement(event.target)) {
      markFrameActive();
    }
  }, true);

  document.addEventListener("play", (event) => {
    if (controller.isUsableVideo(event.target)) {
      markFrameActive();
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "viewtune/execute") {
      const result = controller.execute(message.action);
      if (result.found) {
        markFrameActive();
      }
      sendResponse(withRuntime(result));
      return;
    }

    if (message?.type === "viewtune/status") {
      sendResponse(withRuntime(controller.getStatus()));
    }
  });

  function withRuntime(result) {
    return { ...result, runtime: runtimeIdentity(chrome.runtime) };
  }

  function markRuntimeBuild() {
    const mark = () => document.documentElement?.setAttribute("data-viewtune-build", BUILD_ID);
    mark();
    if (!document.documentElement) {
      document.addEventListener("readystatechange", mark, { once: true });
    }
  }
})();
