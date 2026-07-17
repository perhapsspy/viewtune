(() => {
  "use strict";

  const {
    ACTIONS,
    DEFAULT_TARGET_PLAYBACK_RATE,
    MAX_PLAYBACK_RATE,
    MIN_PLAYBACK_RATE,
    normalizeTargetPlaybackRate,
    t
  } = globalThis.ViewTune;

  const PLAYER_SURFACE_HINT_SELECTOR = [
    "#movie_player",
    ".html5-video-player",
    ".video-js",
    ".jwplayer",
    ".plyr",
    ".shaka-video-container",
    "[data-plyr-provider]"
  ].join(", ");
  const WINDOW_HOST_ATTRIBUTE = "data-viewtune-window-host";
  const WINDOW_FILL_ATTRIBUTE = "data-viewtune-window-fill";
  const WINDOW_FRAME_ATTRIBUTE = "data-viewtune-window-frame";
  const WINDOW_VIDEO_ATTRIBUTE = "data-viewtune-window-video";
  const WINDOW_PENDING_ATTRIBUTE = "data-viewtune-window-pending";
  const WINDOW_DISPLAY_PROPERTY = "--viewtune-window-display";
  const WIDE_CROP_ATTRIBUTE = "data-viewtune-wide-crop";
  const CROP_WIDTH_PROPERTY = "--viewtune-crop-width";
  const CROP_HEIGHT_PROPERTY = "--viewtune-crop-height";
  const WIDE_CROP_MIN_SCALE = 1.02;
  const MAX_PLAYER_ANCESTORS = 8;
  const MAX_CONTROL_WITNESSES = 32;
  const MAX_OVERLAY_WITNESSES = 8;
  const CONTROL_SELECTOR = [
    "button",
    "[role='button']",
    "input[type='range']",
    "[role='slider']",
    "[aria-controls]",
    "[tabindex][aria-label]"
  ].join(", ");

  class Toast {
    constructor(documentRef) {
      this.document = documentRef;
      this.host = null;
      this.label = null;
      this.timer = null;
    }

    show(message) {
      this.ensureHost();
      this.moveHostIntoFullscreen();
      this.label.textContent = message;
      this.host.dataset.visible = "true";
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.host) {
          delete this.host.dataset.visible;
        }
      }, 1300);
    }

    ensureHost() {
      if (this.host) {
        return;
      }

      const host = this.document.createElement("div");
      host.setAttribute("data-viewtune-toast", "");
      host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; pointer-events: none;";

      const root = host.attachShadow({ mode: "closed" });
      const style = this.document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        .toast {
          position: fixed;
          top: max(18px, env(safe-area-inset-top));
          left: 50%;
          max-width: min(360px, calc(100vw - 32px));
          box-sizing: border-box;
          padding: 9px 13px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          background: rgba(20, 21, 24, 0.9);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
          color: #fff;
          font: 600 13px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: -0.01em;
          opacity: 0;
          transform: translate(-50%, -8px);
          transition: opacity 130ms ease, transform 130ms ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        :host([data-visible]) .toast {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        @media (prefers-reduced-motion: reduce) {
          .toast { transition: none; }
        }
      `;
      const label = this.document.createElement("div");
      label.className = "toast";
      root.append(style, label);
      (this.document.documentElement || this.document).append(host);

      this.host = host;
      this.label = label;
    }

    moveHostIntoFullscreen() {
      const target = this.document.fullscreenElement || this.document.documentElement;
      if (target && this.host.parentNode !== target) {
        target.append(this.host);
      }
    }
  }

  class VideoController {
    constructor({ documentRef = document, windowRef = window } = {}) {
      this.document = documentRef;
      this.window = windowRef;
      this.toast = new Toast(documentRef);
      this.showFeedback = true;
      this.lastInteractedVideo = null;
      this.lastInteractionAt = 0;
      this.lastPlayingVideo = null;
      this.lastPlayAt = 0;
      this.activeWindowLayout = null;
      this.activeWideCrop = null;
      this.stateObserver = null;
      this.windowLayoutValidationToken = null;
      this.targetPlaybackRate = DEFAULT_TARGET_PLAYBACK_RATE;
      this.pendingRateResumes = new WeakMap();

      this.trackVideoInteractions();
    }

    setFeedbackEnabled(enabled) {
      this.showFeedback = Boolean(enabled);
    }

    setTargetPlaybackRate(rate) {
      this.targetPlaybackRate = normalizeTargetPlaybackRate(rate);
    }

    hasActiveWindowLayout() {
      return Boolean(this.activeWindowLayout);
    }

    hasControllableVideo() {
      return Boolean(this.activeConnectedVideo() || this.findVideo());
    }

    getStatus() {
      this.cleanupDetachedState();
      const video = this.activeConnectedVideo() || this.findVideo();
      return {
        found: Boolean(video),
        rate: video ? video.playbackRate : null,
        modes: this.currentModes(),
        pendingModes: this.currentPendingModes()
      };
    }

    execute(action) {
      this.cleanupDetachedState();

      if (action === ACTIONS.WIDE) {
        return this.toggleWideCrop();
      }
      if (action === ACTIONS.WINDOW) {
        return this.toggleWindowLayout();
      }

      if (action === ACTIONS.SPEED_DOWN) {
        return this.changePlaybackRate(-0.5);
      }
      if (action === ACTIONS.SPEED_UP) {
        return this.changePlaybackRate(0.5);
      }
      if (action === ACTIONS.SPEED_TARGET) {
        return this.setPlaybackRate(this.targetPlaybackRate);
      }
      if (action === ACTIONS.SPEED_RESET) {
        return this.setPlaybackRate(1);
      }

      const video = this.activeConnectedVideo() || this.findVideo();
      const message = t("contentUnknownAction", undefined, "알 수 없는 ViewTune 동작입니다.");
      return video
        ? this.resultFor(video, { ok: false, message })
        : { ...this.noVideoResult(), message };
    }

    trackVideoInteractions() {
      this.document.addEventListener("pointerdown", (event) => {
        const video = this.videoFromElement(event.target);
        if (video) {
          this.rememberInteraction(video);
        }
      }, true);

      this.document.addEventListener("play", (event) => {
        if (this.isVideo(event.target)) {
          this.lastPlayingVideo = event.target;
          this.lastPlayAt = Date.now();
        }
      }, true);
    }

    findVideo() {
      if (this.isUsableVideo(this.activeWideCrop?.video)) {
        return this.activeWideCrop.video;
      }
      if (this.isUsableVideo(this.activeWindowLayout?.video)) {
        return this.activeWindowLayout.video;
      }

      const candidates = [...this.document.querySelectorAll("video")]
        .filter((video) => this.isUsableVideo(video));

      if (candidates.length === 0) {
        return null;
      }

      return candidates
        .map((video) => ({ video, score: this.videoScore(video) }))
        .sort((left, right) => right.score - left.score)[0].video;
    }

    activeConnectedVideo() {
      const video = this.activeWideCrop?.video || this.activeWindowLayout?.video;
      return video?.isConnected ? video : null;
    }

    isVideo(value) {
      return value instanceof this.window.HTMLVideoElement;
    }

    isUsableVideo(video) {
      if (!this.isVideo(video) || !video.isConnected) {
        return false;
      }

      const rect = video.getBoundingClientRect();
      if (video.ended || rect.width < 64 || rect.height < 48) {
        return false;
      }

      const visible = this.visibleDimensions(rect);
      const styles = this.window.getComputedStyle(video);
      return visible.width >= 64
        && visible.height >= 48
        && styles.display !== "none"
        && styles.visibility !== "hidden"
        && Number.parseFloat(styles.opacity) > 0;
    }

    videoScore(video) {
      const rect = video.getBoundingClientRect();
      const visible = this.visibleDimensions(rect);
      let score = visible.width * visible.height;
      if (!video.paused) {
        score *= 1.35;
      }
      if (this.isRecentVideo(video, this.lastInteractedVideo, this.lastInteractionAt)) {
        score *= 1.85;
      }
      if (this.isRecentVideo(video, this.lastPlayingVideo, this.lastPlayAt)) {
        score *= 1.2;
      }
      return score;
    }

    visibleDimensions(rect) {
      return {
        width: Math.max(0, Math.min(rect.right, this.window.innerWidth) - Math.max(rect.left, 0)),
        height: Math.max(0, Math.min(rect.bottom, this.window.innerHeight) - Math.max(rect.top, 0))
      };
    }

    isRecentVideo(video, rememberedVideo, rememberedAt) {
      return video === rememberedVideo && Date.now() - rememberedAt < 20 * 60 * 1000;
    }

    rememberInteraction(video) {
      this.lastInteractedVideo = video;
      this.lastInteractionAt = Date.now();
    }

    videoFromElement(target) {
      if (!(target instanceof this.window.Element)) {
        return null;
      }
      if (this.isVideo(target)) {
        return target;
      }

      const hintedSurface = target.closest(PLAYER_SURFACE_HINT_SELECTOR);
      const hintedVideo = hintedSurface?.querySelector("video");
      if (this.isVideo(hintedVideo)) {
        return hintedVideo;
      }

      let current = target.parentElement;
      let depth = 0;
      while (current && depth < MAX_PLAYER_ANCESTORS) {
        if (current === this.document.documentElement || current === this.document.body) {
          break;
        }
        const videos = Array.from(current.querySelectorAll?.("video") || [])
          .filter((video) => this.isVideo(video));
        if (videos.length === 1) {
          return videos[0];
        }
        if (videos.length > 1) {
          return null;
        }
        current = current.parentElement;
        depth += 1;
      }
      return null;
    }

    changePlaybackRate(delta) {
      const video = this.findVideo();
      if (!video) {
        return this.noVideoResult();
      }

      const requestedRate = this.clampRate(video.playbackRate + delta);
      const nextRate = this.rateSupportedByPage(requestedRate);
      this.applyPlaybackRate(video, nextRate);
      this.rememberInteraction(video);
      const formattedRate = this.formatRate(nextRate);
      const siteLimited = nextRate !== requestedRate;
      const isAtLimit = nextRate === MIN_PLAYBACK_RATE || nextRate === MAX_PLAYBACK_RATE;
      this.showToast(siteLimited
        ? t("contentSpeedSiteLimit", [formattedRate], `속도 ${formattedRate}× (사이트 한계)`)
        : isAtLimit
          ? t("contentSpeedLimit", [formattedRate], `속도 ${formattedRate}× (한계)`)
          : t("contentSpeed", [formattedRate], `속도 ${formattedRate}×`));
      return this.resultFor(video, { ok: true });
    }

    setPlaybackRate(rate) {
      const video = this.findVideo();
      if (!video) {
        return this.noVideoResult();
      }

      const requestedRate = this.clampRate(rate);
      const nextRate = this.rateSupportedByPage(requestedRate);
      this.applyPlaybackRate(video, nextRate);
      this.rememberInteraction(video);
      const formattedRate = this.formatRate(nextRate);
      this.showToast(nextRate === requestedRate
        ? t("contentSpeed", [formattedRate], `속도 ${formattedRate}×`)
        : t("contentSpeedSiteLimit", [formattedRate], `속도 ${formattedRate}× (사이트 한계)`));
      return this.resultFor(video, { ok: true });
    }

    applyPlaybackRate(video, rate) {
      if (video.playbackRate === rate) {
        return;
      }

      const previousResume = this.pendingRateResumes.get(video);
      const shouldResume = this.requiresPausedRateChange()
        && (previousResume?.shouldResume || (!video.paused && !video.ended));
      if (shouldResume && typeof video.pause === "function") {
        video.pause();
      }
      video.playbackRate = rate;
      if (!shouldResume || typeof video.play !== "function") {
        this.pendingRateResumes.delete(video);
        return;
      }

      const resumeToken = { shouldResume: true };
      this.pendingRateResumes.set(video, resumeToken);
      const resume = () => {
        if (this.pendingRateResumes.get(video) !== resumeToken) {
          return;
        }
        if (!video.isConnected || video.ended) {
          this.pendingRateResumes.delete(video);
          return;
        }
        this.pendingRateResumes.delete(video);
        try {
          const playResult = video.play();
          playResult?.catch?.(() => {});
        } catch {
          // 사이트가 재생 재개를 거절하면 사용자의 다음 재생 입력에 맡긴다.
        }
      };
      if (typeof this.window.requestAnimationFrame === "function") {
        this.window.requestAnimationFrame(resume);
      } else if (typeof this.window.setTimeout === "function") {
        this.window.setTimeout?.(resume, 0);
      } else {
        resume();
      }
    }

    rateSupportedByPage(rate) {
      return this.isNetflixPage() ? Math.min(1.5, rate) : rate;
    }

    requiresPausedRateChange() {
      return this.isNetflixPage();
    }

    isNetflixPage() {
      try {
        const hostname = String(this.document.location?.hostname || "").toLowerCase();
        return hostname === "netflix.com" || hostname.endsWith(".netflix.com");
      } catch {
        return false;
      }
    }

    toggleWindowLayout() {
      if (this.activeWindowLayout) {
        return this.dismissWindowLayout();
      }

      const video = this.findVideo();
      if (!video) {
        return this.noVideoResult();
      }
      if (!this.isTopLevelFrame()) {
        const message = t(
          "contentEmbeddedFrameUnsupported",
          undefined,
          "iframe 영상은 탭 전체 창 맞춤을 안전하게 적용할 수 없어요."
        );
        this.showToast(message);
        return this.resultFor(video, { ok: false, message, reason: "embedded-frame" });
      }

      const surface = this.playerSurfaceFor(video);
      const layout = this.activateWindowLayout({ surface, video });
      if (!layout) {
        const message = t(
          "contentWindowUnsupported",
          undefined,
          "이 플레이어 구조에서는 화면 맞춤을 안전하게 적용할 수 없어요."
        );
        this.showToast(message);
        return this.resultFor(video, { ok: false, message });
      }

      this.syncActiveWideCrop();
      const initialGeometry = this.layoutGeometryStatus(layout);
      this.recordLayoutDiagnostic("initial", layout, initialGeometry, true);
      if (!initialGeometry.usable) {
        this.deactivateWindowLayout(layout);
        this.syncActiveWideCrop();
        const message = t(
          "contentWindowRestoredBroken",
          undefined,
          "영상 크기가 깨져 원래 화면으로 복원했어요."
        );
        this.showToast(message);
        return this.resultFor(video, { ok: false, message });
      }

      this.activeWindowLayout = layout;
      this.observeWindowLayout(layout);
      this.refreshStateObserver();
      this.scheduleWindowLayoutValidation(layout);
      this.showToast(t("contentWindowEnabled", undefined, "창 맞춤"));
      return this.resultFor(video, { ok: true });
    }

    dismissWindowLayout() {
      if (!this.activeWindowLayout) {
        return { ...this.noVideoResult(), reason: "window-layout-inactive" };
      }

      const video = this.activeWindowLayout.video;
      this.resetWindowLayout();
      this.showToast(t("contentWindowDisabled", undefined, "창 맞춤 해제"));
      return this.resultFor(video, { ok: true });
    }

    toggleWideCrop() {
      if (this.activeWideCrop) {
        const video = this.activeWideCrop.video;
        this.resetWideCrop();
        this.showToast(t("contentWideDisabled", undefined, "21:9 확대 해제"));
        return this.resultFor(video, { ok: true });
      }

      const video = this.findVideo();
      if (!video) {
        return this.noVideoResult();
      }

      const surface = this.playerSurfaceFor(video) || video;
      const originalSurfaceRect = this.normalizedRect(surface);
      const demand = this.wideCropDemand(video, originalSurfaceRect);
      if (!demand.needed) {
        const message = demand.reason === "metadata-unavailable"
          ? t("contentWideMetadataUnavailable", undefined, "영상 비율을 확인할 수 없어 확대하지 않았어요.")
          : t("contentWideAlreadyFit", undefined, "현재 화면 비율에서는 확대할 여백이 없어요.");
        this.showToast(message);
        return this.resultFor(video, {
          ok: true,
          changed: false,
          reason: demand.reason
        });
      }

      const crop = originalSurfaceRect
        ? this.activateWideCrop({ surface, video, sourceAspect: demand.sourceAspect })
        : null;
      if (!crop) {
        const message = t(
          "contentWideUnsupported",
          undefined,
          "이 플레이어에서는 영상 확대를 안전하게 적용할 수 없어요."
        );
        this.showToast(message);
        return this.resultFor(video, { ok: false, message });
      }

      const geometry = this.wideCropGeometryStatus(crop, originalSurfaceRect);
      if (!geometry.usable) {
        this.deactivateWideCrop(crop);
        const message = t(
          "contentWideCanceledGeometry",
          undefined,
          "플레이어 크기가 바뀌어 영상 확대를 취소했어요."
        );
        this.showToast(message);
        return this.resultFor(video, { ok: false, message });
      }

      this.activeWideCrop = crop;
      this.observeWideCrop(crop);
      this.refreshStateObserver();
      this.showToast(t("contentWideEnabled", undefined, "21:9 확대 · 일부 잘림 가능"));
      return this.resultFor(video, { ok: true });
    }

    playerSurfaceFor(video) {
      const hintedSurface = video.closest?.(PLAYER_SURFACE_HINT_SELECTOR);
      if (this.isUsablePlayerSurface(hintedSurface, video)) {
        return hintedSurface;
      }

      return this.discoverPlayerSurface(video);
    }

    activateWindowLayout({ surface, video }) {
      const plan = this.layoutPlanFor(surface, video);
      if (!plan) {
        return null;
      }

      const layout = {
        mode: ACTIONS.WINDOW,
        surface,
        video,
        ...plan
      };
      return this.applyWindowLayout(layout) ? layout : null;
    }

    activateWideCrop({ surface, video, sourceAspect = this.videoAspectRatio(video) }) {
      if (!Number.isFinite(sourceAspect) || sourceAspect <= 0) {
        return null;
      }

      const kind = surface === video ? "self" : "surface";
      const crop = { kind, sourceAspect, surface, video, rendering: false };
      if (this.syncWideCropGeometry(crop) !== "applied") {
        this.deactivateWideCrop(crop);
        return null;
      }
      return crop;
    }

    syncActiveWideCrop() {
      if (!this.activeWideCrop) {
        return true;
      }
      return this.syncWideCropGeometry(this.activeWideCrop) !== "unavailable";
    }

    syncWideCropGeometry(crop) {
      if (!crop?.surface?.isConnected || !crop.video?.isConnected) {
        if (crop?.video) {
          this.clearWideCropRendering(crop);
        }
        return "unavailable";
      }

      const surfaceRect = this.normalizedRect(crop.surface);
      if (!surfaceRect || surfaceRect.width < 64 || surfaceRect.height < 48) {
        this.clearWideCropRendering(crop);
        return "unavailable";
      }

      const currentSourceAspect = this.videoAspectRatio(crop.video);
      if (!currentSourceAspect) {
        this.clearWideCropRendering(crop);
        return "unavailable";
      }
      crop.sourceAspect = currentSourceAspect;
      const demand = this.wideCropDemand(crop.video, surfaceRect, crop.sourceAspect);
      if (!demand.needed) {
        this.clearWideCropRendering(crop);
        return "dormant";
      }

      if (crop.kind !== "self") {
        const style = crop.video.style;
        if (typeof style?.setProperty !== "function") {
          this.clearWideCropRendering(crop);
          return "unavailable";
        }
        this.setStylePropertyIfChanged(style, CROP_WIDTH_PROPERTY, this.cssPixels(surfaceRect.width));
        this.setStylePropertyIfChanged(style, CROP_HEIGHT_PROPERTY, this.cssPixels(surfaceRect.height));
      }

      crop.video.setAttribute(WIDE_CROP_ATTRIBUTE, crop.kind);
      crop.rendering = true;
      return "applied";
    }

    wideCropDemand(video, surfaceRect, sourceAspect = this.videoAspectRatio(video)) {
      if (!surfaceRect
        || !Number.isFinite(surfaceRect.width)
        || !Number.isFinite(surfaceRect.height)
        || surfaceRect.width <= 0
        || surfaceRect.height <= 0
        || !Number.isFinite(sourceAspect)
        || sourceAspect <= 0) {
        return { needed: false, reason: "metadata-unavailable", sourceAspect: null };
      }

      const surfaceAspect = surfaceRect.width / surfaceRect.height;
      const scale = surfaceAspect / sourceAspect;
      return {
        needed: Number.isFinite(scale) && scale >= WIDE_CROP_MIN_SCALE,
        reason: scale >= WIDE_CROP_MIN_SCALE ? "wider-surface" : "already-fit",
        scale,
        sourceAspect,
        surfaceAspect
      };
    }

    videoAspectRatio(video) {
      const width = Number(video?.videoWidth);
      const height = Number(video?.videoHeight);
      return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? width / height
        : null;
    }

    setStylePropertyIfChanged(style, property, value) {
      if (typeof style.getPropertyValue !== "function" || style.getPropertyValue(property) !== value) {
        style.setProperty(property, value);
      }
    }

    cssPixels(value) {
      return `${Math.round(value * 1000) / 1000}px`;
    }

    layoutPlanFor(surface, video) {
      if (!surface || !video || !this.isTopLevelFrame() || this.hasConflictingPresentationMode()) {
        return null;
      }

      const controlWitnesses = surface === video ? [] : this.captureControlWitnesses(surface);
      const overlayWitnesses = surface === video ? [] : this.captureOverlayWitnesses(surface, video);
      if (surface !== video && controlWitnesses.length === 0 && overlayWitnesses.length === 0) {
        return null;
      }
      const controlBaseline = surface === video
        ? null
        : this.controlEnvelope(controlWitnesses, this.normalizedRect(surface), true);

      const layoutElement = this.discoverPopoverHost(surface, video);
      const fillElements = this.buildFillPath(surface, layoutElement);
      if (!layoutElement || fillElements === null) {
        return null;
      }

      return {
        strategy: "popover",
        controlBaseline,
        controlWitnesses,
        overlayWitnesses,
        fillElements,
        frameElement: surface,
        layoutElement,
        layoutAttribute: WINDOW_HOST_ATTRIBUTE,
        ownsPopoverAttribute: true,
        popoverOpened: false
      };
    }

    hasConflictingPresentationMode() {
      try {
        return Boolean(
          this.document.fullscreenElement
          || this.document.pictureInPictureElement
          || this.window.documentPictureInPicture?.window
        );
      } catch {
        return true;
      }
    }

    isTopLevelFrame() {
      try {
        return this.window.top == null || this.window.top === this.window;
      } catch {
        return false;
      }
    }

    discoverPopoverHost(surface, video) {
      const surfaceRect = this.normalizedRect(surface);
      if (!surfaceRect || surfaceRect.width < 64 || surfaceRect.height < 48) {
        return null;
      }

      let candidate = null;
      let branch = surface;
      let current = surface.parentElement;
      let depth = 0;
      while (current && depth < MAX_PLAYER_ANCESTORS) {
        if (current === this.document.documentElement || current === this.document.body) {
          break;
        }

        const currentRect = this.normalizedRect(current);
        if (!currentRect || !this.rectsRepresentSameFrame(surfaceRect, currentRect)) {
          break;
        }
        if (!this.canOwnPopover(current) || this.hasLargeVisibleSibling(current, branch, currentRect)) {
          break;
        }

        candidate = current;
        branch = current;
        current = current.parentElement;
        depth += 1;
      }
      return candidate;
    }

    canOwnPopover(element) {
      return Boolean(
        element?.isConnected
        && typeof element.showPopover === "function"
        && typeof element.hidePopover === "function"
        && typeof element.matches === "function"
        && !element.hasAttribute?.("popover")
      );
    }

    rectsRepresentSameFrame(reference, candidate) {
      const xTolerance = Math.max(8, reference.width * 0.03);
      const yTolerance = Math.max(8, reference.height * 0.03);
      return Math.abs(reference.left - candidate.left) <= xTolerance
        && Math.abs(reference.top - candidate.top) <= yTolerance
        && Math.abs(reference.width - candidate.width) <= xTolerance
        && Math.abs(reference.height - candidate.height) <= yTolerance;
    }

    hasLargeVisibleSibling(candidate, branch, candidateRect) {
      const candidateArea = candidateRect.width * candidateRect.height;
      if (!Number.isFinite(candidateArea) || candidateArea <= 0) {
        return true;
      }

      for (const sibling of Array.from(candidate.children || [])) {
        if (sibling === branch || sibling.contains?.(branch)) {
          continue;
        }
        const siblingRect = this.normalizedRect(sibling);
        if (!siblingRect || siblingRect.width < 2 || siblingRect.height < 2) {
          continue;
        }
        const siblingArea = siblingRect.width * siblingRect.height;
        if (siblingArea / candidateArea >= 0.15
          && this.overlapArea(candidateRect, siblingRect) / siblingArea >= 0.5) {
          return true;
        }
      }
      return false;
    }

    buildFillPath(surface, layoutElement) {
      if (!layoutElement) {
        return null;
      }
      if (surface === layoutElement) {
        return [];
      }

      const fillElements = [];
      let current = surface.parentElement;
      while (current && current !== layoutElement && fillElements.length < MAX_PLAYER_ANCESTORS) {
        fillElements.push(current);
        current = current.parentElement;
      }
      return current === layoutElement ? fillElements : null;
    }

    isUsablePlayerSurface(surface, video) {
      if (!surface?.isConnected || !video?.isConnected || !surface.contains?.(video)) {
        return false;
      }
      if (surface === video) {
        return this.videoUsesNativeControls(video);
      }

      const surfaceRect = this.normalizedRect(surface);
      const videoRect = this.normalizedRect(video);
      if (!surfaceRect || !videoRect || surfaceRect.width < 64 || surfaceRect.height < 48) {
        return false;
      }
      const smallerArea = Math.min(
        surfaceRect.width * surfaceRect.height,
        videoRect.width * videoRect.height
      );
      return smallerArea > 0
        && this.overlapArea(surfaceRect, videoRect) / smallerArea >= 0.8
        && (
          this.captureControlWitnesses(surface).length > 0
          || this.captureOverlayWitnesses(surface, video).length > 0
        );
    }

    discoverPlayerSurface(video) {
      if (this.videoUsesNativeControls(video)) {
        return video;
      }

      let current = video?.parentElement;
      let depth = 0;
      while (current && depth < MAX_PLAYER_ANCESTORS) {
        if (current === this.document.documentElement || current === this.document.body) {
          break;
        }
        if (this.isUsablePlayerSurface(current, video)) {
          return current;
        }
        current = current.parentElement;
        depth += 1;
      }
      return null;
    }

    videoUsesNativeControls(video) {
      return Boolean(video?.controls || video?.hasAttribute?.("controls"));
    }

    captureControlWitnesses(surface) {
      if (typeof surface?.querySelectorAll !== "function") {
        return [];
      }

      const candidates = [];
      for (const element of Array.from(surface.querySelectorAll(CONTROL_SELECTOR))) {
        const rect = this.normalizedRect(element);
        if (element?.isConnected !== false && rect && rect.width >= 2 && rect.height >= 2) {
          candidates.push({ element, rect });
        }
      }
      if (candidates.length <= MAX_CONTROL_WITNESSES) {
        return candidates;
      }

      const selected = new Set();
      const take = (ordered) => {
        for (const witness of ordered.slice(0, MAX_CONTROL_WITNESSES / 4)) {
          selected.add(witness);
        }
      };
      take([...candidates].sort((left, right) => left.rect.left - right.rect.left));
      take([...candidates].sort((left, right) => right.rect.right - left.rect.right));
      take([...candidates].sort((left, right) => right.rect.bottom - left.rect.bottom));
      take([...candidates].sort((left, right) => (
        right.rect.width * right.rect.height - left.rect.width * left.rect.height
      )));
      return Array.from(selected).slice(0, MAX_CONTROL_WITNESSES);
    }

    captureOverlayWitnesses(surface, video) {
      if (!surface?.children || surface === video || !surface.contains?.(video)) {
        return [];
      }

      const surfaceRect = this.normalizedRect(surface);
      const videoRect = this.normalizedRect(video);
      if (!surfaceRect || !videoRect || !this.rectsRepresentSameFrame(surfaceRect, videoRect)) {
        return [];
      }
      const surfaceArea = surfaceRect.width * surfaceRect.height;
      const videoArea = videoRect.width * videoRect.height;
      if (surfaceArea <= 0 || videoArea <= 0) {
        return [];
      }

      const videoBranch = Array.from(surface.children).find(
        (child) => child === video || child.contains?.(video)
      );
      const witnesses = [];
      for (const element of Array.from(surface.children)) {
        if (element === videoBranch) {
          continue;
        }
        const rect = this.normalizedRect(element);
        if (!rect || rect.width < 64 || rect.height < 48) {
          continue;
        }
        if (!this.rectsRepresentSameFrame(surfaceRect, rect)
          || !this.rectsRepresentSameFrame(videoRect, rect)) {
          continue;
        }
        witnesses.push({ element, rect });
        if (witnesses.length >= MAX_OVERLAY_WITNESSES) {
          break;
        }
      }
      return witnesses;
    }

    applyWindowLayout(layout) {
      const host = layout.layoutElement;
      layout.environmentSnapshot = this.windowLayoutEnvironmentSnapshot();
      try {
        const computedDisplay = typeof this.window.getComputedStyle === "function"
          ? this.window.getComputedStyle(host).display
          : "block";
        if (!computedDisplay || computedDisplay === "none") {
          return false;
        }
        const style = host.style;
        if (typeof style?.setProperty === "function") {
          layout.displayPropertySnapshot = {
            value: style.getPropertyValue?.(WINDOW_DISPLAY_PROPERTY) || "",
            priority: style.getPropertyPriority?.(WINDOW_DISPLAY_PROPERTY) || ""
          };
          style.setProperty(WINDOW_DISPLAY_PROPERTY, computedDisplay);
        }
        host.setAttribute("popover", "manual");
        host.setAttribute(WINDOW_PENDING_ATTRIBUTE, "");
        host.setAttribute(WINDOW_HOST_ATTRIBUTE, ACTIONS.WINDOW);
        for (const element of layout.fillElements) {
          element.setAttribute(WINDOW_FILL_ATTRIBUTE, "");
        }
        layout.frameElement?.setAttribute(WINDOW_FRAME_ATTRIBUTE, "");
        layout.video.setAttribute(WINDOW_VIDEO_ATTRIBUTE, "");
        layout.handlePopoverToggle = (event) => {
          if (event?.newState === "closed"
            && !layout.deactivating
            && this.activeWindowLayout === layout
            && !this.isLayoutPopoverOpen(layout)) {
            this.resetWindowLayout();
            this.showToast(t(
              "contentWindowLayerClosed",
              undefined,
              "화면 레이어가 닫혀 원래 화면으로 복원했어요."
            ));
          }
        };
        host.addEventListener?.("toggle", layout.handlePopoverToggle);
        host.showPopover();
        layout.popoverOpened = true;
        if (!this.isLayoutPopoverOpen(layout)) {
          throw new Error("popover-did-not-open");
        }
        return true;
      } catch {
        this.deactivateWindowLayout(layout);
        return false;
      }
    }

    windowLayoutEnvironmentSnapshot() {
      try {
        const scrollX = Number(this.window.scrollX);
        const scrollY = Number(this.window.scrollY);
        return {
          focusedElement: this.document.activeElement || null,
          scrollX: Number.isFinite(scrollX) ? scrollX : null,
          scrollY: Number.isFinite(scrollY) ? scrollY : null
        };
      } catch {
        return { focusedElement: null, scrollX: null, scrollY: null };
      }
    }

    isLayoutPopoverOpen(layout) {
      if (layout?.strategy !== "popover") {
        return true;
      }
      try {
        return layout.layoutElement.matches(":popover-open");
      } catch {
        return Boolean(layout.popoverOpened);
      }
    }

    isLayoutGeometryUsable(layout) {
      return this.layoutGeometryStatus(layout).usable;
    }

    layoutGeometryStatus(layout) {
      const fail = (reason, details = {}) => ({ usable: false, reason, ...details });
      if (!layout.layoutElement.isConnected
        || !layout.surface?.isConnected
        || !layout.video.isConnected) {
        return fail("element-disconnected");
      }
      if (!this.isLayoutPopoverOpen(layout)) {
        return fail("popover-closed");
      }

      const hostRect = this.normalizedRect(layout.layoutElement);
      const frameRect = layout.frameElement ? this.normalizedRect(layout.frameElement) : null;
      const videoRect = this.normalizedRect(layout.video);
      const details = { hostRect, frameRect, videoRect };
      if (!hostRect || !videoRect || (layout.frameElement && !frameRect)) {
        return fail("rect-unavailable", details);
      }
      if (hostRect.width < 64 || hostRect.height < 48) {
        return fail("host-collapsed", details);
      }
      if (videoRect.width < 64 || videoRect.height < 48) {
        return fail("video-collapsed", details);
      }

      const hostArea = hostRect.width * hostRect.height;
      if (this.overlapArea(hostRect, videoRect) / hostArea < 0.85) {
        return fail("video-frame-mismatch", details);
      }
      if (frameRect && this.overlapArea(hostRect, frameRect) / hostArea < 0.85) {
        return fail("player-frame-mismatch", details);
      }
      const controlStatus = this.controlGeometryStatus(layout, frameRect || hostRect);
      if (!controlStatus.usable) {
        return fail(controlStatus.reason, { ...details, controlCount: controlStatus.controlCount });
      }
      if (!this.hostMatchesWindow(hostRect)) {
        return fail("host-mode-mismatch", details);
      }

      return { usable: true, reason: "ok", controlCount: controlStatus.controlCount, ...details };
    }

    controlGeometryStatus(layout, frameRect) {
      if (layout.strategy !== "popover" || layout.surface === layout.video) {
        return { usable: true, reason: "ok", controlCount: 0 };
      }

      const overlayStatus = this.overlayGeometryStatus(layout, frameRect);
      const fallbackToOverlay = (reason, controlCount = 0) => overlayStatus.usable
        ? { ...overlayStatus, controlCount, evidence: "overlay" }
        : { usable: false, reason, controlCount };

      const witnesses = layout.controlWitnesses || [];
      if (witnesses.length === 0 || typeof layout.surface.contains !== "function") {
        return fallbackToOverlay("controls-unavailable");
      }

      let controlCount = 0;
      for (const witness of witnesses) {
        const element = witness.element;
        if (!element?.isConnected || !layout.surface.contains(element)) {
          return fallbackToOverlay("control-disconnected", controlCount);
        }
        const rect = this.normalizedRect(element);
        if (!rect || rect.width < 2 || rect.height < 2) {
          return fallbackToOverlay("control-collapsed", controlCount);
        }
        const controlArea = rect.width * rect.height;
        if (this.overlapArea(frameRect, rect) / controlArea < 0.8) {
          return { usable: false, reason: "control-outside-frame", controlCount };
        }
        controlCount += 1;
      }
      const currentEnvelope = this.controlEnvelope(witnesses, frameRect);
      if (layout.controlBaseline
        && !this.controlEnvelopeMatches(layout.controlBaseline, currentEnvelope)) {
        return { usable: false, reason: "control-layout-mismatch", controlCount };
      }
      return { usable: true, reason: "ok", controlCount, evidence: "controls" };
    }

    overlayGeometryStatus(layout, frameRect) {
      const witnesses = layout.overlayWitnesses || [];
      if (witnesses.length === 0 || typeof layout.surface?.contains !== "function") {
        return { usable: false, reason: "overlay-unavailable", overlayCount: 0 };
      }

      const frameArea = frameRect.width * frameRect.height;
      let lastReason = "overlay-unavailable";
      let overlayCount = 0;
      for (const witness of witnesses) {
        const element = witness.element;
        if (!element?.isConnected || !layout.surface.contains(element)) {
          lastReason = "overlay-disconnected";
          continue;
        }
        const rect = this.normalizedRect(element);
        if (!rect || rect.width < 64 || rect.height < 48) {
          lastReason = "overlay-collapsed";
          continue;
        }
        if (frameArea <= 0 || !this.rectsRepresentSameFrame(frameRect, rect)) {
          lastReason = "overlay-frame-mismatch";
          continue;
        }
        overlayCount += 1;
      }
      return overlayCount > 0
        ? { usable: true, reason: "ok", overlayCount }
        : { usable: false, reason: lastReason, overlayCount: 0 };
    }

    controlEnvelope(witnesses, frameRect, useSnapshot = false) {
      if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0 || witnesses.length === 0) {
        return null;
      }

      const rects = witnesses
        .map((witness) => useSnapshot ? witness.rect : this.normalizedRect(witness.element))
        .filter(Boolean);
      if (rects.length === 0) {
        return null;
      }
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return {
        left: (left - frameRect.left) / frameRect.width,
        right: (right - frameRect.left) / frameRect.width,
        top: (top - frameRect.top) / frameRect.height,
        bottom: (bottom - frameRect.top) / frameRect.height,
        width: (right - left) / frameRect.width,
        height: (bottom - top) / frameRect.height
      };
    }

    controlEnvelopeMatches(baseline, current) {
      if (!baseline || !current) {
        return false;
      }
      if (baseline.width >= 0.5 && current.width < baseline.width * 0.82) {
        return false;
      }
      if (baseline.left <= 0.25 && current.left > baseline.left + 0.12) {
        return false;
      }
      if (baseline.right >= 0.75 && current.right < baseline.right - 0.12) {
        return false;
      }
      if (baseline.bottom >= 0.75 && current.bottom < baseline.bottom - 0.12) {
        return false;
      }
      return true;
    }

    reconcileControlWitnesses(layout) {
      if (layout.strategy !== "popover" || layout.surface === layout.video) {
        return true;
      }

      const frameRect = this.normalizedRect(layout.frameElement || layout.layoutElement);
      if (!frameRect) {
        return false;
      }
      const currentStatus = this.controlGeometryStatus(layout, frameRect);
      if (currentStatus.usable && currentStatus.evidence !== "overlay") {
        return true;
      }

      if (currentStatus.usable) {
        const remountedControls = this.captureControlWitnesses(layout.surface);
        if (remountedControls.length === 0) {
          return true;
        }
        layout.controlWitnesses = remountedControls;
        return this.controlGeometryStatus(layout, frameRect).usable;
      }

      const replacements = this.captureControlWitnesses(layout.surface);
      if (replacements.length > 0) {
        layout.controlWitnesses = replacements;
      }
      const overlayReplacements = this.captureOverlayWitnesses(layout.surface, layout.video);
      if (overlayReplacements.length > 0) {
        layout.overlayWitnesses = overlayReplacements;
      }
      return this.controlGeometryStatus(layout, frameRect).usable;
    }

    wideCropGeometryStatus(crop, originalSurfaceRect = null) {
      const fail = (reason, details = {}) => ({ usable: false, reason, ...details });
      if (!crop.surface?.isConnected || !crop.video?.isConnected) {
        return fail("element-disconnected");
      }

      const surfaceRect = this.normalizedRect(crop.surface);
      const videoRect = this.normalizedRect(crop.video);
      const details = { surfaceRect, videoRect };
      if (!surfaceRect || !videoRect) {
        return fail("rect-unavailable", details);
      }
      if (surfaceRect.width < 64 || surfaceRect.height < 48) {
        return fail("surface-collapsed", details);
      }
      if (videoRect.width < 64 || videoRect.height < 48) {
        return fail("video-collapsed", details);
      }
      if (originalSurfaceRect && !this.rectsApproximatelyEqual(originalSurfaceRect, surfaceRect)) {
        return fail("surface-mutated", details);
      }
      if (!crop.rendering || !this.wideCropDemand(crop.video, surfaceRect, crop.sourceAspect).needed) {
        return fail("crop-not-needed", details);
      }

      const surfaceArea = surfaceRect.width * surfaceRect.height;
      if (this.overlapArea(surfaceRect, videoRect) / surfaceArea < 0.97) {
        return fail("video-does-not-cover-surface", details);
      }
      return { usable: true, reason: "ok", ...details };
    }

    normalizedRect(element) {
      const rect = element?.getBoundingClientRect?.();
      if (!rect) {
        return null;
      }

      const left = Number(rect.left);
      const top = Number(rect.top);
      const width = Number(rect.width);
      const height = Number(rect.height);
      const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width;
      const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height;
      const values = [left, top, right, bottom, width, height];
      return values.every(Number.isFinite) ? { left, top, right, bottom, width, height } : null;
    }

    overlapArea(first, second) {
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      return width * height;
    }

    rectsApproximatelyEqual(first, second, tolerance = 2) {
      return Math.abs(first.left - second.left) <= tolerance
        && Math.abs(first.top - second.top) <= tolerance
        && Math.abs(first.width - second.width) <= tolerance
        && Math.abs(first.height - second.height) <= tolerance;
    }

    hostMatchesWindow(hostRect) {
      const viewportWidth = Number(this.window.innerWidth);
      const viewportHeight = Number(this.window.innerHeight);
      if (!Number.isFinite(viewportWidth)
        || !Number.isFinite(viewportHeight)
        || viewportWidth <= 0
        || viewportHeight <= 0) {
        return true;
      }

      const edgeTolerance = 8;
      const sizeTolerance = 16;
      return Math.abs(hostRect.left) <= edgeTolerance
        && Math.abs(hostRect.top) <= edgeTolerance
        && Math.abs(hostRect.width - viewportWidth) <= sizeTolerance
        && Math.abs(hostRect.height - viewportHeight) <= sizeTolerance;
    }

    scheduleWindowLayoutValidation(layout) {
      if (typeof this.window.requestAnimationFrame !== "function") {
        this.markWindowLayoutReady(layout);
        return;
      }

      const token = {};
      this.windowLayoutValidationToken = token;
      const nextFrame = (callback) => this.window.requestAnimationFrame(callback);
      nextFrame(() => nextFrame(() => {
        if (this.windowLayoutValidationToken !== token || this.activeWindowLayout !== layout) {
          return;
        }

        this.windowLayoutValidationToken = null;
        const pathCurrent = this.isLayoutPathCurrent(layout);
        this.reconcileControlWitnesses(layout);
        const geometry = this.layoutGeometryStatus(layout);
        this.recordLayoutDiagnostic("settled", layout, geometry, pathCurrent);
        if (!pathCurrent || !geometry.usable) {
          this.resetWindowLayout();
          this.showToast(t(
            "contentWindowUnstable",
            undefined,
            "영상 크기가 안정되지 않아 원래 화면으로 복원했어요."
          ));
          return;
        }
        this.markWindowLayoutReady(layout);
      }));
    }

    observeWindowLayout(layout) {
      const handleGeometryChange = () => {
        if (this.activeWindowLayout !== layout) {
          return;
        }
        if (this.hasConflictingPresentationMode()) {
          this.resetWindowLayout();
          this.showToast(t(
            "contentWindowConflictingMode",
            undefined,
            "다른 화면 모드가 시작되어 창 맞춤을 해제했어요."
          ));
          return;
        }

        const validate = () => {
          layout.observationScheduled = false;
          if (this.activeWindowLayout !== layout) {
            return;
          }
          const pathCurrent = this.isLayoutPathCurrent(layout);
          this.reconcileControlWitnesses(layout);
          const geometry = this.layoutGeometryStatus(layout);
          this.recordLayoutDiagnostic("observed", layout, geometry, pathCurrent);
          if (!pathCurrent || !geometry.usable) {
            this.resetWindowLayout();
            this.showToast(t(
              "contentWindowStructureChanged",
              undefined,
              "플레이어 구조가 바뀌어 원래 화면으로 복원했어요."
            ));
          }
        };

        if (typeof this.window.requestAnimationFrame === "function") {
          if (!layout.observationScheduled) {
            layout.observationScheduled = true;
            this.window.requestAnimationFrame(validate);
          }
        } else {
          validate();
        }
      };
      layout.handleGeometryChange = handleGeometryChange;

      if (typeof this.window.ResizeObserver === "function") {
        try {
          layout.resizeObserver = new this.window.ResizeObserver(handleGeometryChange);
          for (const element of new Set([layout.layoutElement, layout.surface, layout.video])) {
            layout.resizeObserver.observe(element);
          }
        } catch {
          layout.resizeObserver?.disconnect?.();
          layout.resizeObserver = null;
        }
      }
      this.window.addEventListener?.("resize", handleGeometryChange);
      this.document.addEventListener?.("fullscreenchange", handleGeometryChange);
      layout.video.addEventListener?.("enterpictureinpicture", handleGeometryChange);
      this.window.documentPictureInPicture?.addEventListener?.("enter", handleGeometryChange);
    }

    stopObservingWindowLayout(layout) {
      layout.observationScheduled = false;
      layout.resizeObserver?.disconnect?.();
      layout.resizeObserver = null;
      this.window.removeEventListener?.("resize", layout.handleGeometryChange);
      this.document.removeEventListener?.("fullscreenchange", layout.handleGeometryChange);
      layout.video?.removeEventListener?.("enterpictureinpicture", layout.handleGeometryChange);
      this.window.documentPictureInPicture?.removeEventListener?.("enter", layout.handleGeometryChange);
      layout.handleGeometryChange = null;
    }

    markWindowLayoutReady(layout) {
      layout.layoutElement?.removeAttribute?.(WINDOW_PENDING_ATTRIBUTE);
    }

    isLayoutPathCurrent(layout) {
      if (layout.surface === layout.layoutElement) {
        return true;
      }

      let current = layout.surface.parentElement;
      for (const expected of layout.fillElements) {
        if (current !== expected) {
          return false;
        }
        current = current.parentElement;
      }
      return current === layout.layoutElement;
    }

    recordLayoutDiagnostic(phase, layout, geometry, pathCurrent) {
      try {
        const objectFit = typeof this.window.getComputedStyle === "function"
          ? this.window.getComputedStyle(layout.video).objectFit
          : null;
        this.document.documentElement?.setAttribute(
          "data-viewtune-layout-diagnostic",
          JSON.stringify({
            phase,
            mode: layout.mode,
            strategy: layout.strategy || null,
            usable: geometry.usable,
            reason: pathCurrent ? geometry.reason : "player-path-changed",
            pathCurrent,
            popoverOpen: this.isLayoutPopoverOpen(layout),
            controlCount: geometry.controlCount || 0,
            hostRect: geometry.hostRect || null,
            frameRect: geometry.frameRect || null,
            videoRect: geometry.videoRect || null,
            objectFit,
            viewport: {
              width: Number(this.window.innerWidth) || null,
              height: Number(this.window.innerHeight) || null
            }
          })
        );
      } catch {
        // 진단 기록 실패가 비디오 제어를 막아서는 안 된다.
      }
    }

    resetWindowLayout() {
      if (!this.activeWindowLayout) {
        return false;
      }

      const layout = this.activeWindowLayout;
      this.activeWindowLayout = null;
      this.windowLayoutValidationToken = null;
      this.stopObservingWindowLayout(layout);
      this.deactivateWindowLayout(layout);
      this.syncActiveWideCrop();
      this.refreshStateObserver();
      return true;
    }

    deactivateWindowLayout(layout) {
      layout.deactivating = true;
      layout.layoutElement?.removeEventListener?.("toggle", layout.handlePopoverToggle);
      layout.handlePopoverToggle = null;
      if (this.isLayoutPopoverOpen(layout)) {
        try {
          layout.layoutElement.hidePopover();
        } catch {
          // 이미 닫힌 popover도 아래의 소유 속성 정리는 계속한다.
        }
      }
      layout.popoverOpened = false;
      layout.layoutElement?.removeAttribute?.(WINDOW_PENDING_ATTRIBUTE);
      layout.layoutElement?.removeAttribute?.(layout.layoutAttribute || WINDOW_HOST_ATTRIBUTE);
      layout.frameElement?.removeAttribute?.(WINDOW_FRAME_ATTRIBUTE);
      layout.video?.removeAttribute?.(WINDOW_VIDEO_ATTRIBUTE);
      for (const element of layout.fillElements || []) {
        element.removeAttribute?.(WINDOW_FILL_ATTRIBUTE);
      }
      if (layout.ownsPopoverAttribute) {
        layout.layoutElement?.removeAttribute?.("popover");
      }
      const style = layout.layoutElement?.style;
      if (layout.displayPropertySnapshot && typeof style?.setProperty === "function") {
        if (layout.displayPropertySnapshot.value) {
          style.setProperty(
            WINDOW_DISPLAY_PROPERTY,
            layout.displayPropertySnapshot.value,
            layout.displayPropertySnapshot.priority
          );
        } else {
          style.removeProperty?.(WINDOW_DISPLAY_PROPERTY);
        }
      }
      this.restoreWindowLayoutEnvironment(layout);
      layout.deactivating = false;
    }

    restoreWindowLayoutEnvironment(layout) {
      const snapshot = layout.environmentSnapshot;
      layout.environmentSnapshot = null;
      if (!snapshot) {
        return;
      }

      const focusedElement = snapshot.focusedElement;
      if (focusedElement?.isConnected
        && this.document.activeElement !== focusedElement
        && typeof focusedElement.focus === "function") {
        try {
          focusedElement.focus({ preventScroll: true });
        } catch {
          try {
            focusedElement.focus();
          } catch {
            // 원래 focus를 복원할 수 없어도 레이아웃 정리는 완료한다.
          }
        }
      }

      if (snapshot.scrollX !== null
        && snapshot.scrollY !== null
        && typeof this.window.scrollTo === "function") {
        try {
          this.window.scrollTo(snapshot.scrollX, snapshot.scrollY);
        } catch {
          // iframe 또는 종료 중인 문서에서는 scroll 복원이 거절될 수 있다.
        }
      }
    }

    resetWideCrop() {
      if (!this.activeWideCrop) {
        return false;
      }

      const crop = this.activeWideCrop;
      this.activeWideCrop = null;
      this.stopObservingWideCrop(crop);
      this.deactivateWideCrop(crop);
      this.refreshStateObserver();
      return true;
    }

    deactivateWideCrop(crop) {
      this.clearWideCropRendering(crop);
    }

    clearWideCropRendering(crop) {
      crop.video?.removeAttribute?.(WIDE_CROP_ATTRIBUTE);
      if (crop.kind !== "self") {
        crop.video?.style?.removeProperty?.(CROP_WIDTH_PROPERTY);
        crop.video?.style?.removeProperty?.(CROP_HEIGHT_PROPERTY);
      }
      crop.rendering = false;
    }

    observeWideCrop(crop) {
      const handleGeometryChange = () => {
        if (this.activeWideCrop !== crop) {
          return;
        }
        this.syncWideCropGeometry(crop);
        if (typeof this.window.requestAnimationFrame === "function") {
          this.window.requestAnimationFrame(() => {
            if (this.activeWideCrop === crop) {
              this.syncWideCropGeometry(crop);
            }
          });
        }
      };
      crop.handleGeometryChange = handleGeometryChange;

      if (typeof this.window.ResizeObserver === "function") {
        crop.resizeObserver = new this.window.ResizeObserver(handleGeometryChange);
        crop.resizeObserver.observe(crop.surface);
      }
      this.window.addEventListener?.("resize", handleGeometryChange);
      this.document.addEventListener?.("fullscreenchange", handleGeometryChange);
      crop.video.addEventListener?.("resize", handleGeometryChange);
      crop.video.addEventListener?.("loadedmetadata", handleGeometryChange);
    }

    stopObservingWideCrop(crop) {
      crop.resizeObserver?.disconnect();
      this.window.removeEventListener?.("resize", crop.handleGeometryChange);
      this.document.removeEventListener?.("fullscreenchange", crop.handleGeometryChange);
      crop.video.removeEventListener?.("resize", crop.handleGeometryChange);
      crop.video.removeEventListener?.("loadedmetadata", crop.handleGeometryChange);
    }

    refreshStateObserver() {
      this.stateObserver?.disconnect();
      this.stateObserver = null;
      if (!this.activeWindowLayout && !this.activeWideCrop) {
        return;
      }
      if (typeof this.window.MutationObserver !== "function" || !this.document.documentElement) {
        return;
      }

      this.stateObserver = new this.window.MutationObserver(() => this.cleanupDetachedState());
      this.stateObserver.observe(this.document.documentElement, { childList: true, subtree: true });
    }

    cleanupDetachedState() {
      const layout = this.activeWindowLayout;
      if (layout) {
        const fillWasRemoved = layout.fillElements.some((element) => !element.isConnected);
        const structureChanged = !layout.layoutElement.isConnected
          || !layout.surface.isConnected
          || !layout.video.isConnected
          || fillWasRemoved
          || !this.isLayoutPathCurrent(layout)
          || !this.isLayoutPopoverOpen(layout);
        if (structureChanged || !this.reconcileControlWitnesses(layout)) {
          this.resetWindowLayout();
        }
      }

      const crop = this.activeWideCrop;
      if (crop && (!crop.surface.isConnected || !crop.video.isConnected)) {
        this.resetWideCrop();
      }
    }

    currentModes() {
      return {
        [ACTIONS.WIDE]: Boolean(this.activeWideCrop),
        [ACTIONS.WINDOW]: Boolean(this.activeWindowLayout)
      };
    }

    currentPendingModes() {
      return {
        [ACTIONS.WIDE]: false,
        [ACTIONS.WINDOW]: Boolean(this.activeWindowLayout && this.windowLayoutValidationToken)
      };
    }

    resultFor(video, overrides = {}) {
      return {
        found: true,
        rate: video.playbackRate,
        modes: this.currentModes(),
        pendingModes: this.currentPendingModes(),
        ...overrides
      };
    }

    noVideoResult() {
      return {
        found: false,
        ok: false,
        rate: null,
        modes: this.currentModes(),
        pendingModes: this.currentPendingModes(),
        message: t(
          "contentNoVideo",
          undefined,
          "이 페이지에서 제어할 비디오를 찾지 못했습니다."
        )
      };
    }

    clampRate(rate) {
      const rounded = Math.round(rate * 100) / 100;
      return Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rounded));
    }

    formatRate(rate) {
      return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }

    showToast(message) {
      if (this.showFeedback) {
        this.toast.show(message);
      }
    }
  }

  globalThis.ViewTune.VideoController = VideoController;
})();
