"use strict";

const activeFrames = new Map();
const ACTIVE_FRAME_STORAGE_PREFIX = "viewtune-active-frame:";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "viewtune/activate-frame") {
    if (sender.tab?.id !== undefined && Number.isInteger(sender.frameId)) {
      rememberActiveFrame(sender.tab.id, sender.frameId);
    }
    return;
  }

  if (message?.type === "viewtune/tab-command") {
    forwardToActiveFrame(message.tabId, {
      type: "viewtune/execute",
      action: message.action
    }).then(sendResponse);
    return true;
  }

  if (message?.type === "viewtune/tab-status") {
    forwardToActiveFrame(message.tabId, { type: "viewtune/status" }).then(sendResponse);
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeFrames.delete(tabId);
  chrome.storage.session.remove(activeFrameStorageKey(tabId)).catch(() => {});
});

async function forwardToActiveFrame(tabId, message) {
  if (!Number.isInteger(tabId)) {
    return noReceiverResult();
  }

  const rememberedFrameId = await rememberedFrameFor(tabId);
  const frameIds = [...new Set([rememberedFrameId, 0].filter(Number.isInteger))];

  for (const frameId of frameIds) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message, { frameId });
      if (response?.found) {
        rememberActiveFrame(tabId, frameId);
        return response;
      }
      if (frameId === 0) {
        return response || noReceiverResult();
      }
    } catch {
      // 탐색 뒤 사라진 iframe은 무시하고 다음 후보 프레임을 시도한다.
    }
  }

  return noReceiverResult();
}

function rememberActiveFrame(tabId, frameId) {
  activeFrames.set(tabId, frameId);
  chrome.storage.session.set({ [activeFrameStorageKey(tabId)]: frameId }).catch(() => {});
}

async function rememberedFrameFor(tabId) {
  const inMemoryFrameId = activeFrames.get(tabId);
  if (Number.isInteger(inMemoryFrameId)) {
    return inMemoryFrameId;
  }

  try {
    const storageKey = activeFrameStorageKey(tabId);
    const stored = await chrome.storage.session.get(storageKey);
    const frameId = stored[storageKey];
    if (Number.isInteger(frameId)) {
      activeFrames.set(tabId, frameId);
      return frameId;
    }
  } catch {
    // session storage를 사용할 수 없는 경우 최상위 프레임으로 안전하게 fallback한다.
  }

  return undefined;
}

function activeFrameStorageKey(tabId) {
  return `${ACTIVE_FRAME_STORAGE_PREFIX}${tabId}`;
}

function noReceiverResult() {
  return {
    receiverMissing: true,
    found: false,
    ok: false,
    rate: null,
    modes: { wide: false, window: false },
    pendingModes: { wide: false, window: false },
    message: "이 탭에서 ViewTune이 제어할 비디오를 찾지 못했습니다."
  };
}
