import { usePlayerStore } from "../store/playerStore";
import { ApiError } from "@/shared/api";
import { log } from "@/shared/utils/logger";
import { telemetry } from "@/shared/telemetry";
import { linerDb, audioCache } from "@/shared/storage";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import type { Track } from "@/shared/types";
import { pitchShifter } from "./pitchShifter";
import {
  ARM_WINDOW_SEC,
  crossfadeGains,
  planTransition,
  transitionsEnabled,
  type TransitionSettings,
} from "./transitions";
import { resolvePlaybackStream, type PlaybackStream } from "./streamResolver";
import { downloadAudioBytes } from "@/shared/media/innertube";

const PRIMARY_AUDIO_ID = "liner-audio";
const STANDBY_AUDIO_ID = "liner-audio-standby";
const FADING_AUDIO_ID = "liner-audio-fading";
export const PRIMARY_AUDIO_CHANGED_EVENT = "liner:primary-audio-changed";

export class PlayerRuntime {
  private audio: HTMLAudioElement;
  private currentTrackId: string | null = null;
  private loadEpoch = 0;
  private loadAbortController: AbortController | null = null;
  private isResetting = false;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private stallStartTime: number | null = null;
  private loadStartTime = 0;
  private ttfbMs = 0;
  private activePlayPromise: Promise<void> | null = null;
  private activeBlobUrl: string | null = null;
  private preloadingTrackId: string | null = null;
  private preloadingPromise: Promise<void> | null = null;
  private preloadAbortController: AbortController | null = null;
  private backgroundCacheAbortController: AbortController | null = null;
  private currentSessionExpiresAt: number | null = null;
  private recoveryAttempts = 0;
  // Track transitions: a second element ping-pongs with `audio` (see startTransition).
  private standby: HTMLAudioElement | null = null;
  private standbyTrack: Track | null = null;
  private standbyBlobUrl: string | null = null;
  private standbyReady = false;
  private standbyGeneration = 0;
  private standbyAttempt: { trackId: string; at: number } | null = null;
  private transitionStartTimer: ReturnType<typeof setTimeout> | null = null;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private fadingOut: { el: HTMLAudioElement; blobUrl: string | null } | null = null;
  public onEnded?: () => void;
  public onError?: (info: { trackId: string; message: string }) => void;
  /** Next track an automatic advance would play, or null (repeat-one, end of queue). */
  public getUpcomingTrack?: () => { track: Track; index: number } | null;
  /** The standby element took over: the engine advances the queue without loading. */
  public onTransitionStarted?: (track: Track, index: number) => void;

  constructor() {
    const win = typeof window !== "undefined" ? (window as any) : null;
    let audio = (win?.__liner_audio || (typeof document !== "undefined" && document.getElementById("liner-audio"))) as HTMLAudioElement | null;
    if (!audio) {
      audio = new Audio();
      audio.id = "liner-audio";
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      if (typeof document !== "undefined") {
        document.body.appendChild(audio);
      }
    }
    if (win) {
      win.__liner_audio = audio;
    }
    this.audio = audio;
    this.setupAudioListeners(this.audio);

    const initialVolume = usePlayerStore.getState().volume;
    this.audio.volume = initialVolume;
    this.applyPlaybackRateAndPitch();
    log("cyan", "boot", `volume ${initialVolume}`);

    usePlayerStore.subscribe((state, prevState) => {
      if (state.volume !== prevState.volume) {
        this.cancelFade();
        if (!this.audio.paused) {
          this.audio.volume = state.volume;
        }
      }
      if (
        state.playbackRate !== prevState.playbackRate ||
        state.isPitchLinked !== prevState.isPitchLinked ||
        state.pitchSemitones !== prevState.pitchSemitones ||
        state.isReverbEnabled !== prevState.isReverbEnabled ||
        state.reverbLevel !== prevState.reverbLevel
      ) {
        const rate = state.playbackRate ?? 1;
        const preservesPitch = !state.isPitchLinked;
        this.applyPlaybackRateAndPitch(rate, preservesPitch);
      }
    });

    this.setupDeviceChangeListener();
    this.setupMediaSession();
    log("green", "boot", "player runtime initialized");
  }

  private setupDeviceChangeListener() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    let initial = true;
    const onDeviceChange = () => {
      if (initial) {
        initial = false;
        return;
      }
      if (!usePlayerStore.getState().pauseOnDeviceChange) return;
      if (!this.audio.paused && usePlayerStore.getState().status === "playing") {
        this.pause();
      }
    };

    try {
      navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
      void navigator.mediaDevices.enumerateDevices().then(() => {
        initial = false;
      });
    } catch {
      // ignore unsupported environments
    }
  }

  private setupMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        usePlayerStore.getState().dispatch({ type: "RESUME_REQUESTED" });
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        usePlayerStore.getState().dispatch({ type: "SKIP_PREVIOUS" });
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        usePlayerStore.getState().dispatch({ type: "SKIP_NEXT" });
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined && !Number.isNaN(details.seekTime)) {
          usePlayerStore.getState().dispatch({
            type: "SEEK_COMMITTED",
            positionMs: Math.round(details.seekTime * 1000),
          });
        }
      });
    } catch {
      // ignore unsupported media session actions
    }
  }

  public updateMediaSessionMetadata(track: Track | null) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artists,
        album: (track as { albumTitle?: string }).albumTitle || "Liner",
        artwork: track.coverUrl
          ? [
              { src: track.coverUrl, sizes: "96x96", type: "image/jpeg" },
              { src: track.coverUrl, sizes: "256x256", type: "image/jpeg" },
              { src: track.coverUrl, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });
    } catch {
      // ignore metadata assignment failures
    }
  }

  private setupAudioListeners(audioEl: HTMLAudioElement) {
    audioEl.addEventListener("timeupdate", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId) return;
      if (usePlayerStore.getState().status === "loading") return;
      if (Number.isNaN(audioEl.currentTime)) return;

      const posMs = Math.round(audioEl.currentTime * 1000);
      usePlayerStore.getState().setPosition(posMs);
      this.checkTransition();
    });

    audioEl.addEventListener("durationchange", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId) return;
      if (Number.isNaN(audioEl.duration) || audioEl.duration <= 0) return;

      usePlayerStore.getState().setDuration(Math.round(audioEl.duration * 1000));
    });

    audioEl.addEventListener("waiting", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      log("yellow", "audio", "buffering (waiting)");
      this.stallStartTime = performance.now();
      if (usePlayerStore.getState().status === "playing") {
        usePlayerStore.getState().setStatus("loading");
      }
    });

    audioEl.addEventListener("ended", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId) return;

      // Ensure the track truly finished playing (not an empty media load or teardown artefact)
      const duration = audioEl.duration;
      const currentTime = audioEl.currentTime;
      if (duration > 0 && currentTime >= Math.max(0, duration - 1.5)) {
        log("cyan", "audio", "ended — skipping to next");
        this.onEnded?.();
        const state = usePlayerStore.getState();
        state.dispatch({ type: "SKIP_NEXT", isAutoEnd: true });
      }
    });

    audioEl.addEventListener("playing", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      log("green", "audio", "playing");
      this.recoveryAttempts = 0;
      this.applyPlaybackRateAndPitch();

      if (this.stallStartTime !== null) {
        const stallDurationMs = Math.round(performance.now() - this.stallStartTime);
        if (stallDurationMs > 400) {
          telemetry.trackPlaybackHealth("STALL_BUFFERING", {
            trackId: this.currentTrackId || undefined,
            stallDurationMs,
          });
        }
        this.stallStartTime = null;
      }

      if (!this.currentTrackId || audioEl.paused) return;
      const currentStatus = usePlayerStore.getState().status;
      if (currentStatus !== "paused") {
        usePlayerStore.getState().setStatus("playing");
      }
    });

    audioEl.addEventListener("pause", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      log("cyan", "audio", "paused");
      const st = usePlayerStore.getState().status;
      if (st === "playing") {
        usePlayerStore.getState().setStatus("paused");
      }
    });

    audioEl.addEventListener("error", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId || !audioEl.src || audioEl.src === window.location.href) return;

      const message = audioEl.error?.message || "Audio playback error";
      const code = audioEl.error?.code;
      console.error("[AudioElementError]", this.currentTrackId, code, message, audioEl.src);
      log("red", "audio", `error (code ${code}): ${message}`);

      const isDecode =
        code === (typeof MediaError !== "undefined" ? MediaError.MEDIA_ERR_DECODE : 3) ||
        code === (typeof MediaError !== "undefined" ? MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED : 4);

      if (isDecode) {
        telemetry.trackPlaybackHealth("MEDIA_DECODE_ERROR", {
          trackId: this.currentTrackId || undefined,
          errorMessage: message,
          details: { mediaErrorCode: code },
        });
      }

      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
        this.activeBlobUrl = null;
        void linerDb.deleteAudio(this.currentTrackId);
        audioCache.deleteAudio(this.currentTrackId);
      }

      const store = usePlayerStore.getState();
      const currentTrack = store.currentTrack;
      if (
        currentTrack &&
        currentTrack.id === this.currentTrackId &&
        this.recoveryAttempts < 1
      ) {
        this.recoveryAttempts++;
        const posMs = store.positionMs;
        log("yellow", "playback", `audio error encountered — recovering via cache/stream at ${posMs}ms`);
        void this.loadAndPlay(currentTrack, posMs, true);
        return;
      }

      usePlayerStore.getState().setStatus("error", message);
      this.onError?.({ trackId: this.currentTrackId, message });
    });
  }

  public getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  public hasLoadedSourceFor(trackId: string): boolean {
    const isExpired =
      this.currentSessionExpiresAt !== null &&
      Date.now() >= this.currentSessionExpiresAt - 15_000;
    return (
      this.currentTrackId === trackId &&
      Boolean(this.audio.currentSrc || this.audio.src) &&
      this.audio.src !== window.location.href &&
      !this.audio.error &&
      !isExpired
    );
  }

  public applyPlaybackRateAndPitch(rate?: number, preservesPitch?: boolean): void {
    if (!this.audio) return;
    const store = usePlayerStore.getState();
    const targetRate = rate ?? store.playbackRate ?? 1;
    const targetPreserves =
      preservesPitch ?? (store.isPitchLinked !== undefined ? !store.isPitchLinked : true);

    try {
      this.audio.playbackRate = targetRate;
      this.audio.defaultPlaybackRate = targetRate;
      this.audio.preservesPitch = targetPreserves;
      (this.audio as any).mozPreservesPitch = targetPreserves;
      (this.audio as any).webkitPreservesPitch = targetPreserves;
    } catch {
      // Audio element not initialized or properties unsupported
    }

    try {
      const isPitchLinked = store.isPitchLinked ?? true;
      const pitchSemitones = store.pitchSemitones ?? 0;
      const isReverbEnabled = store.isReverbEnabled ?? false;
      const reverbLevel = store.reverbLevel ?? 0.35;
      const needsEffects = isReverbEnabled || (!isPitchLinked && Math.abs(pitchSemitones) >= 0.05);
      if (!needsEffects && !pitchShifter.isAttached()) return;
      // Join the partner element first so a later crossfade stays on the effects chain.
      if (this.standby) pitchShifter.attach(this.standby);
      pitchShifter.attach(this.audio);
      pitchShifter.update({
        pitchSemitones,
        isPitchLinked,
        isReverbEnabled,
        reverbLevel,
      });
    } catch (err) {
      console.error("[PlayerRuntime] applyPlaybackRateAndPitch error:", err);
    }
  }

  private transitionSettings(): TransitionSettings {
    const s = usePlayerStore.getState();
    return { crossfadeSec: s.crossfadeSec ?? 0, gapless: s.gaplessPlayback ?? false };
  }

  /** Polled from the primary element's timeupdate. A no-op while transitions are off. */
  private checkTransition(): void {
    const settings = this.transitionSettings();
    if (!transitionsEnabled(settings)) {
      if (this.standbyTrack || this.transitionStartTimer) this.discardStandby();
      return;
    }
    const store = usePlayerStore.getState();
    if (store.status !== "playing" || this.audio.paused || this.fadingOut) return;

    const upcoming = this.getUpcomingTrack?.() ?? null;
    if (!upcoming || upcoming.track.id === this.currentTrackId) {
      if (this.standbyTrack) this.discardStandby();
      return;
    }
    if (this.standbyTrack && this.standbyTrack.id !== upcoming.track.id) {
      // Queue changed under us; prepare the new next track instead.
      this.discardStandby();
    }

    const plan = planTransition({
      durationSec: this.audio.duration,
      positionSec: this.audio.currentTime,
      playbackRate: this.audio.playbackRate,
      settings,
      nextDurationSec: upcoming.track.durationMs ? upcoming.track.durationMs / 1000 : null,
    });
    if (!plan) return;

    if (plan.secondsUntilPrepare <= 0 && !this.standbyTrack) {
      void this.prepareStandby(upcoming.track);
    }

    if (plan.secondsUntilStart <= ARM_WINDOW_SEC) {
      this.clearTransitionTimer();
      const epoch = this.loadEpoch;
      this.transitionStartTimer = setTimeout(() => {
        this.transitionStartTimer = null;
        if (epoch !== this.loadEpoch) return;
        void this.startTransition(plan.fadeSec);
      }, plan.secondsUntilStart * 1000);
    }
  }

  private ensureStandbyElement(): HTMLAudioElement {
    if (this.standby) return this.standby;
    const el = new Audio();
    el.id = STANDBY_AUDIO_ID;
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    if (typeof document !== "undefined") document.body.appendChild(el);
    this.setupAudioListeners(el);
    this.standby = el;
    return el;
  }

  /** Loads the next track (already cached by preloadTrack) into the standby element. */
  private async prepareStandby(track: Track): Promise<void> {
    const now = Date.now();
    if (this.standbyAttempt?.trackId === track.id && now - this.standbyAttempt.at < 2000) return;
    this.standbyAttempt = { trackId: track.id, at: now };
    const generation = ++this.standbyGeneration;
    const epoch = this.loadEpoch;

    try {
      if (this.preloadingTrackId === track.id && this.preloadingPromise) {
        await this.preloadingPromise;
      }
      const cached = await linerDb.getAudio(track.id);
      if (generation !== this.standbyGeneration || epoch !== this.loadEpoch) return;
      const blob = cached?.blob;
      if (!blob || blob.size === 0 || (blob.type && !blob.type.startsWith("audio/"))) return;

      const el = this.ensureStandbyElement();
      const url = URL.createObjectURL(blob);
      this.standbyBlobUrl = url;
      this.standbyTrack = track;
      this.standbyReady = false;
      el.addEventListener(
        "canplay",
        () => {
          if (this.standby === el && this.standbyBlobUrl === url) this.standbyReady = true;
        },
        { once: true },
      );
      el.volume = 0;
      el.src = url;
      el.load();
      if (pitchShifter.isAttached()) pitchShifter.attach(el);
      log("cyan", "transition", `standby ready to load: ${track.title}`);
    } catch {
      // Transition is best-effort; the normal ended → SKIP_NEXT path still runs.
    }
  }

  private clearTransitionTimer(): void {
    if (this.transitionStartTimer !== null) {
      clearTimeout(this.transitionStartTimer);
      this.transitionStartTimer = null;
    }
  }

  private discardStandby(): void {
    this.clearTransitionTimer();
    this.standbyGeneration += 1;
    const el = this.standby;
    if (el && el.getAttribute("src")) {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {}
    }
    if (this.standbyBlobUrl) {
      URL.revokeObjectURL(this.standbyBlobUrl);
      this.standbyBlobUrl = null;
    }
    this.standbyTrack = null;
    this.standbyReady = false;
  }

  /** Cuts any running crossfade short and drops a prepared standby track. */
  private abortTransitions(keepStandby = false): void {
    this.clearTransitionTimer();
    this.finishFadeOut();
    if (!keepStandby) this.discardStandby();
  }

  private async startTransition(fadeSec: number): Promise<void> {
    const el = this.standby;
    const track = this.standbyTrack;
    const blobUrl = this.standbyBlobUrl;
    if (!el || !track || !this.standbyReady || this.fadingOut) return;
    const store = usePlayerStore.getState();
    if (store.status !== "playing" || this.audio.paused) return;
    // The queue may have changed since checkTransition armed the timer.
    const upcoming = this.getUpcomingTrack?.() ?? null;
    if (!upcoming || upcoming.track.id !== track.id) {
      this.discardStandby();
      return;
    }
    const index = upcoming.index;

    const old = this.audio;
    const generation = this.standbyGeneration;
    const epoch = this.loadEpoch;
    const remainingWallSec = Math.max(
      0,
      (old.duration - old.currentTime) / (old.playbackRate || 1),
    );
    const fade = Math.min(fadeSec, remainingWallSec);

    el.playbackRate = old.playbackRate;
    el.defaultPlaybackRate = old.playbackRate;
    el.preservesPitch = old.preservesPitch;
    el.volume = fade > 0 ? 0 : store.volume;

    try {
      await el.play();
    } catch (err) {
      log("yellow", "transition", `standby play failed: ${String(err)}`);
      if (generation === this.standbyGeneration) this.discardStandby();
      return;
    }
    if (
      generation !== this.standbyGeneration ||
      epoch !== this.loadEpoch ||
      this.audio !== old ||
      this.standby !== el
    ) {
      el.pause();
      return;
    }
    if (this.getUpcomingTrack?.()?.track.id !== track.id) {
      this.discardStandby();
      return;
    }

    // Swap roles: the standby becomes primary, the old primary fades out.
    this.cancelFade();
    this.standby = null;
    this.standbyTrack = null;
    this.standbyBlobUrl = null;
    this.standbyReady = false;
    old.id = FADING_AUDIO_ID;
    el.id = PRIMARY_AUDIO_ID;
    this.audio = el;
    if (typeof window !== "undefined") (window as any).__liner_audio = el;
    this.fadingOut = { el: old, blobUrl: this.activeBlobUrl };
    this.activeBlobUrl = blobUrl;
    this.currentTrackId = track.id;
    this.currentSessionExpiresAt = null;
    this.recoveryAttempts = 0;
    this.pendingStartPositionMs = 0;
    this.updateMediaSessionMetadata(track);

    this.onEnded?.();
    if (!store.keepSpeedAcrossTracks) store.resetSpeedAndPitch();
    this.applyPlaybackRateAndPitch();
    this.onTransitionStarted?.(track, index);
    if (Number.isFinite(el.duration) && el.duration > 0) {
      usePlayerStore.getState().setDuration(Math.round(el.duration * 1000));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(PRIMARY_AUDIO_CHANGED_EVENT));
    }
    log(
      "green",
      "transition",
      fade > 0 ? `crossfading ${fade.toFixed(1)}s into ${track.title}` : `gapless start: ${track.title}`,
    );

    if (fade <= 0) {
      // Let the old element play out its last few milliseconds, then recycle it.
      this.crossfadeTimer = setTimeout(() => this.finishFadeOut(), remainingWallSec * 1000 + 250);
      return;
    }

    const startedAt = performance.now();
    const oldStartVolume = old.volume;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / (fade * 1000));
      const gains = crossfadeGains(progress);
      const target = usePlayerStore.getState().volume;
      old.volume = Math.max(0, Math.min(1, oldStartVolume * gains.out));
      el.volume = Math.max(0, Math.min(1, target * gains.in));
      if (progress < 1) {
        this.crossfadeTimer = setTimeout(tick, 16);
      } else {
        this.crossfadeTimer = null;
        this.finishFadeOut();
      }
    };
    this.crossfadeTimer = setTimeout(tick, 16);
  }

  /** Stops the outgoing element and recycles it as the next standby. */
  private finishFadeOut(): void {
    if (this.crossfadeTimer !== null) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    const fading = this.fadingOut;
    if (!fading) return;
    this.fadingOut = null;
    try {
      fading.el.pause();
      fading.el.removeAttribute("src");
      fading.el.load();
    } catch {}
    if (fading.blobUrl) URL.revokeObjectURL(fading.blobUrl);
    fading.el.id = STANDBY_AUDIO_ID;
    if (!this.standby) this.standby = fading.el;
    if (!this.audio.paused && usePlayerStore.getState().status === "playing" && this.fadeTimer === null) {
      this.audio.volume = usePlayerStore.getState().volume;
    }
  }

  private cancelFade(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private fadeVolume(
    targetVolume: number,
    durationMs: number = 180,
    onComplete?: () => void,
  ): void {
    this.cancelFade();
    const startVolume = this.audio.volume;
    const diff = targetVolume - startVolume;
    if (Math.abs(diff) < 0.001 || durationMs <= 0) {
      this.audio.volume = Math.max(0, Math.min(1, targetVolume));
      onComplete?.();
      return;
    }

    const startTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const current = startVolume + diff * eased;
      this.audio.volume = Math.max(0, Math.min(1, current));

      if (progress < 1) {
        // audio fade ticks independently of display vsync in background
        this.fadeTimer = setTimeout(tick, 16);
      } else {
        this.fadeTimer = null;
        this.audio.volume = Math.max(0, Math.min(1, targetVolume));
        onComplete?.();
      }
    };

    this.fadeTimer = setTimeout(tick, 16);
  }

  private safeResetAudioElement() {
    this.isResetting = true;
    this.currentSessionExpiresAt = null;
    try {
      this.cancelFade();
      this.audio.pause();
      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
        this.activeBlobUrl = null;
      }
      this.audio.removeAttribute("src");
      this.audio.load();
    } catch {
    } finally {
      this.isResetting = false;
    }
  }

  public cancelPendingLoad(): void {
    this.abortTransitions();
    this.loadEpoch += 1;
    this.loadAbortController?.abort();
    this.loadAbortController = null;
    this.backgroundCacheAbortController?.abort();
    this.backgroundCacheAbortController = null;
    this.currentTrackId = null;
    this.currentSessionExpiresAt = null;
    this.recoveryAttempts = 0;
    this.safeResetAudioElement();
    usePlayerStore.getState().setStatus("paused");
    log("cyan", "playback", "pending load cancelled");
  }

  public async preloadTrack(track: Track): Promise<void> {
    if (this.currentTrackId === track.id) return;
    if (this.preloadingTrackId === track.id) return;

    const cached = await linerDb.getAudio(track.id);
    if (cached) return;

    this.preloadAbortController?.abort();
    const controller = new AbortController();
    this.preloadAbortController = controller;
    this.preloadingTrackId = track.id;

    const promise = (async () => {
      try {
        const stream = await resolvePlaybackStream(track, controller.signal);
        if (controller.signal.aborted) return;

        const blob = await this.downloadAudioBlob(stream, controller.signal);
        if (!blob || controller.signal.aborted) return;
        await linerDb.putAudio(track.id, blob, blob.type);
        await linerDb.putTrack(track);
        log(
          "green",
          "preload",
          `preloaded audio: "${track.title}" (${Math.round(blob.size / 1024)} KB)`,
        );
      } catch {
      } finally {
        if (this.preloadingTrackId === track.id) {
          this.preloadingTrackId = null;
          this.preloadingPromise = null;
          this.preloadAbortController = null;
        }
      }
    })();

    this.preloadingPromise = promise;
    await promise;
  }

  private pendingStartPositionMs = 0;

  public setPendingSeek(positionMs: number): void {
    this.abortTransitions(true);
    this.pendingStartPositionMs = positionMs;
    usePlayerStore.getState().setPosition(positionMs);
    if (this.audio.src && this.audio.src !== window.location.href) {
      try {
        if (this.audio.readyState >= 1) {
          this.audio.currentTime = positionMs / 1000;
        } else {
          this.audio.addEventListener(
            "loadedmetadata",
            () => {
              try {
                this.audio.currentTime = positionMs / 1000;
              } catch {}
            },
            { once: true },
          );
        }
      } catch {}
    }
  }

  public async loadAndPlay(
    track: Track,
    startPositionMs: number = 0,
    bypassCache: boolean = false,
  ) {
    this.abortTransitions();
    this.cancelFade();
    this.pendingStartPositionMs = startPositionMs;
    const epoch = ++this.loadEpoch;

    if (this.currentTrackId !== track.id) {
      this.recoveryAttempts = 0;
    }

    if (this.preloadingTrackId === track.id && this.preloadingPromise) {
      await this.preloadingPromise;
    } else if (this.preloadingTrackId && this.preloadingTrackId !== track.id) {
      this.preloadAbortController?.abort();
      this.preloadAbortController = null;
      this.preloadingTrackId = null;
      this.preloadingPromise = null;
    }

    this.loadAbortController?.abort();
    const controller = new AbortController();
    this.loadAbortController = controller;

    this.backgroundCacheAbortController?.abort();
    const bgCacheController = new AbortController();
    this.backgroundCacheAbortController = bgCacheController;

    const store = usePlayerStore.getState();
    if (!store.keepSpeedAcrossTracks && this.currentTrackId !== track.id) {
      store.resetSpeedAndPitch();
    }
    this.currentTrackId = track.id;
    this.loadStartTime = performance.now();
    this.updateMediaSessionMetadata(track);

    store.setStatus("loading", null);
    store.setPosition(startPositionMs > 0 ? startPositionMs : 0);

    this.safeResetAudioElement();

    try {
      const cachedAudio = bypassCache ? null : await linerDb.getAudio(track.id);
      if (epoch !== this.loadEpoch || controller.signal.aborted) {
        return;
      }

      const isValidCachedBlob =
        Boolean(cachedAudio?.blob) &&
        cachedAudio!.blob.size > 0 &&
        (!cachedAudio!.blob.type || cachedAudio!.blob.type.startsWith("audio/"));

      if (cachedAudio && !isValidCachedBlob) {
        void linerDb.deleteAudio(track.id);
        audioCache.deleteAudio(track.id);
      }

      if (cachedAudio && isValidCachedBlob) {
        this.currentSessionExpiresAt = null;
        void linerDb.putTrack(track);
        const blobUrl = URL.createObjectURL(cachedAudio.blob);
        this.activeBlobUrl = blobUrl;
        this.audio.src = blobUrl;
        this.audio.volume = 0;
        this.audio.load();
        this.applyPlaybackRateAndPitch();

        const targetPosition =
          this.pendingStartPositionMs > 0
            ? this.pendingStartPositionMs
            : startPositionMs;
        this.seekWhenReady(epoch, targetPosition);
        log(
          "cyan",
          "playback",
          `audio cache hit for "${track.title}" (${Math.round(cachedAudio.byteSize / 1024)} KB)`,
        );

        if (this.audio.readyState < 3) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 3000);
            const onCanPlay = () => {
              clearTimeout(timeout);
              this.audio.removeEventListener("canplay", onCanPlay);
              this.audio.removeEventListener("error", onCanPlay);
              resolve();
            };
            this.audio.addEventListener("canplay", onCanPlay, { once: true });
            this.audio.addEventListener("error", onCanPlay, { once: true });
          });
        }

        if (epoch !== this.loadEpoch || controller.signal.aborted) return;

        const playPromise = this.audio.play();
        this.activePlayPromise = playPromise;
        await playPromise;

        const audioStartLatencyMs = Math.round(
          performance.now() - this.loadStartTime,
        );

        if (epoch === this.loadEpoch) {
          usePlayerStore.getState().setStatus("playing");
          this.fadeVolume(usePlayerStore.getState().volume, 180);
        }
        log(
          "green",
          "playback",
          `started (cached): ${track.title} in ${audioStartLatencyMs}ms`,
        );
        return;
      }

      const stream = await resolvePlaybackStream(track, controller.signal);
      this.ttfbMs = Math.round(performance.now() - this.loadStartTime);

      if (epoch !== this.loadEpoch || controller.signal.aborted) {
        log("yellow", "playback", `superseded before stream ready (${track.title})`);
        return;
      }

      const streamCodec = stream.codec;
      const streamBitrate = stream.bitrate;
      this.currentSessionExpiresAt = stream.expiresAtMs;
      log("cyan", "playback", `resolved stream for ${track.title}`);
      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
        this.activeBlobUrl = null;
      }
      const url = stream.blob ? URL.createObjectURL(stream.blob) : stream.url;
      if (stream.blob) this.activeBlobUrl = url;
      this.audio.src = url;
      this.audio.volume = 0;
      this.audio.load();
      this.applyPlaybackRateAndPitch();

      const targetPosition =
        this.pendingStartPositionMs > 0
          ? this.pendingStartPositionMs
          : startPositionMs;
      this.seekWhenReady(epoch, targetPosition);
      log(
        "green",
        "playback",
        `stream attached: ${streamCodec} ${streamBitrate} bps (${track.title})`,
      );

      if (this.audio.readyState < 3) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 3000);
          const onCanPlay = () => {
            clearTimeout(timeout);
            this.audio.removeEventListener("canplay", onCanPlay);
            this.audio.removeEventListener("error", onCanPlay);
            resolve();
          };
          this.audio.addEventListener("canplay", onCanPlay, { once: true });
          this.audio.addEventListener("error", onCanPlay, { once: true });
        });
      }

      if (epoch !== this.loadEpoch || controller.signal.aborted) return;

      const playPromise = this.audio.play();
      this.activePlayPromise = playPromise;
      await playPromise;

      const audioStartLatencyMs = Math.round(
        performance.now() - this.loadStartTime,
      );

      if (epoch === this.loadEpoch) {
        usePlayerStore.getState().setStatus("playing");
        this.fadeVolume(usePlayerStore.getState().volume, 180);
        this.cacheAudioInBackground(track, stream, bgCacheController.signal);
      }
      log(
        "green",
        "playback",
        `started: ${track.title} in ${audioStartLatencyMs}ms`,
      );

      telemetry.trackPlaybackHealth("INIT_LATENCY", {
        trackId: track.id,
        codec: streamCodec,
        bitrate: streamBitrate,
        timeToFirstByteMs: this.ttfbMs,
        audioStartLatencyMs,
      });
    } catch (error) {
      if (epoch !== this.loadEpoch || controller.signal.aborted) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        log("yellow", "playback", "autoplay blocked — waiting for user gesture");
        usePlayerStore.getState().setStatus("paused");
        return;
      }

      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Playback failed to start.";
      console.error("[LoadAndPlayError]", track.id, error);
      log("red", "playback", `failed: ${message}`);
      usePlayerStore.getState().setStatus("error", message);

      telemetry
        .reportError(error, {
          action: "playback_failed",
          trackId: track.id,
          title: track.title,
        })
        .catch(() => {});

      this.onError?.({ trackId: track.id, message });
    } finally {
      if (epoch === this.loadEpoch) {
        this.activePlayPromise = null;
      }
    }
  }

  private seekWhenReady(epoch: number, positionMs: number) {
    if (positionMs <= 0) return;
    const apply = () => {
      if (epoch !== this.loadEpoch) return;
      try {
        this.audio.currentTime = positionMs / 1000;
      } catch {
        // Media not seekable yet — ignore
      }
    };
    if (this.audio.readyState >= 1) {
      apply();
    } else {
      this.audio.addEventListener("loadedmetadata", apply, { once: true });
    }
  }

  public pause() {
    this.abortTransitions(true);
    const epoch = ++this.loadEpoch;
    this.loadAbortController?.abort();
    this.loadAbortController = null;
    usePlayerStore.getState().setStatus("paused");
    log("cyan", "audio", "pause requested (fading out)");

    this.fadeVolume(0, 180, () => {
      if (epoch !== this.loadEpoch) return;
      this.audio.pause();
    });
  }

  public resume() {
    const epoch = ++this.loadEpoch;
    this.loadAbortController?.abort();
    this.loadAbortController = null;

    const targetVolume = usePlayerStore.getState().volume;
    usePlayerStore.getState().setStatus("playing");
    pitchShifter.resumeContext();
    this.applyPlaybackRateAndPitch();
    log("cyan", "audio", "resume requested (fading in)");

    const currentTrack = usePlayerStore.getState().currentTrack;
    const isExpired =
      this.currentSessionExpiresAt !== null &&
      Date.now() >= this.currentSessionExpiresAt - 15_000;
    const hasMediaError = Boolean(this.audio.error);
    const hasValidSource =
      Boolean(this.audio.src) &&
      this.audio.src !== window.location.href &&
      !isExpired &&
      !hasMediaError;

    if (!hasValidSource && currentTrack) {
      void this.loadAndPlay(
        currentTrack,
        usePlayerStore.getState().positionMs,
      );
      return;
    }

    if (this.audio.paused) {
      this.audio.volume = 0;
      const playPromise = this.audio.play();
      this.activePlayPromise = playPromise;
      playPromise
        .then(() => {
          if (epoch !== this.loadEpoch) return;
          this.fadeVolume(targetVolume, 180);
        })
        .catch((error) => {
          if (epoch !== this.loadEpoch) return;
          if (error.name === "NotAllowedError") {
            log("yellow", "audio", "play blocked — waiting for user gesture");
            usePlayerStore.getState().setStatus("paused");
          } else if (error.name !== "AbortError") {
            log("red", "audio", `play failed: ${String(error)}`);
            if (currentTrack && this.recoveryAttempts < 1) {
              this.recoveryAttempts++;
              log("yellow", "playback", "resume failed — attempting cache/stream recovery");
              void this.loadAndPlay(currentTrack, usePlayerStore.getState().positionMs, true);
              return;
            }
            usePlayerStore.getState().setStatus("paused");
          }
        })
        .finally(() => {
          if (epoch === this.loadEpoch) this.activePlayPromise = null;
        });
    } else {
      this.fadeVolume(targetVolume, 180);
    }
  }

  public seek(positionMs: number) {
    this.abortTransitions(true);
    if (!this.audio.src || this.audio.src === window.location.href) return;
    try {
      if (this.audio.readyState >= 1) {
        this.audio.currentTime = positionMs / 1000;
      } else {
        this.audio.addEventListener(
          "loadedmetadata",
          () => {
            try {
              this.audio.currentTime = positionMs / 1000;
            } catch {}
          },
          { once: true },
        );
      }
    } catch {
      // Ignore seek error if media not yet ready
    }
  }

  private async downloadAudioBlob(stream: PlaybackStream, signal: AbortSignal): Promise<Blob | null> {
    if (stream.blob) return stream.blob;
    const startedAt = performance.now();
    const bytes = await downloadAudioBytes(stream.url, {
      contentLength: stream.contentLength,
      signal,
    });
    if (!bytes || signal.aborted) return null;
    const mimeType = stream.mimeType || "audio/webm";
    if (!mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) return null;
    if (!isStandaloneAudioFile(bytes.subarray(0, 16))) {
      log("yellow", "download", `not caching: stream is not a standalone audio file`);
      return null;
    }
    log(
      "cyan",
      "download",
      `${Math.round(bytes.byteLength / 1024)} KB in ${Math.round(performance.now() - startedAt)}ms (${stream.contentLength ? "chunked" : "single request"})`,
    );
    return new Blob([bytes], { type: mimeType });
  }

  private cacheAudioInBackground(track: Track, stream: PlaybackStream, signal: AbortSignal) {
    if (track.durationMs && track.durationMs > 20 * 60 * 1000) return;
    void (async () => {
      try {
        const blob = await this.downloadAudioBlob(stream, signal);
        if (!blob || signal.aborted) return;
        await linerDb.putAudio(track.id, blob, blob.type);
        await linerDb.putTrack(track);
        log("green", "playback", `background cached: ${track.title} (${Math.round(blob.size / 1024)} KB)`);
      } catch {}
    })();
  }
}

export const playerRuntime =
  typeof window !== "undefined" ? new PlayerRuntime() : null;
