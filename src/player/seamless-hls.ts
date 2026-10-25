import Hls, { Events, type HlsConfig } from 'hls.js';

type HlsListener = (event: Events, data: any) => void;
type Handoff = {
  hls: Hls;
  video: HTMLVideoElement;
  source: string;
  timeout: number;
  cleanup: () => void;
};

/**
 * Keeps the current rendition visible while the next HLS source buffers in a
 * second video. The active picture is replaced only after the standby video
 * has decoded enough media to play, so loadSource never exposes an empty
 * MediaSource to the viewer.
 */
export class SeamlessHls {
  private current: Hls;
  private currentVideo: HTMLVideoElement;
  private currentSource?: string;
  private pending?: Handoff;
  private readonly listeners = new Map<Events, Set<HlsListener>>();
  private destroyed = false;

  constructor(
    video: HTMLVideoElement,
    private readonly config: Partial<HlsConfig>,
    private readonly host: HTMLElement,
    private readonly onVideoChanged: (video: HTMLVideoElement, source: string) => void,
    private readonly onHandoffFailed?: (source: string) => void
  ) {
    this.current = new Hls(config);
    this.currentVideo = video;
    this.prepareVideo(video, true);
  }

  get levels(): Hls['levels'] { return this.current.levels; }
  get currentLevel(): number { return this.current.currentLevel; }
  set currentLevel(value: number) { this.current.currentLevel = value; }
  get nextAutoLevel(): number { return this.current.nextAutoLevel; }
  set nextAutoLevel(value: number) { this.current.nextAutoLevel = value; }

  on(event: Events, listener: HlsListener): void {
    let registered = this.listeners.get(event);
    if (!registered) { registered = new Set(); this.listeners.set(event, registered); }
    registered.add(listener);
    this.current.on(event, listener as never);
  }

  attachMedia(video: HTMLVideoElement): void {
    this.currentVideo = video;
    this.prepareVideo(video, true);
    this.current.attachMedia(video);
  }

  loadSource(source: string): boolean {
    if (this.destroyed) return false;
    if (!this.currentSource) {
      this.currentSource = source;
      this.current.loadSource(source);
      return false;
    }
    // Minimal HLS implementations (including non-browser test doubles) do
    // not expose an attached media element and cannot perform a buffered
    // two-video handoff. Preserve the ordinary loadSource contract there.
    if (typeof (this.current as Hls & { media?: HTMLMediaElement | null }).media === 'undefined') {
      this.currentSource = source;
      this.current.loadSource(source);
      return false;
    }
    if (source === this.currentSource && !this.pending) {
      this.current.startLoad(-1);
      void this.currentVideo.play().catch(() => undefined);
      return false;
    }
    if (this.pending?.source === source) return true;
    this.beginHandoff(source);
    return true;
  }

  /** Reconnects a stalled live playlist through the same buffered handoff. */
  refreshSource(source: string): void {
    if (this.destroyed || this.pending) return;
    if (typeof (this.current as Hls & { media?: HTMLMediaElement | null }).media === 'undefined') {
      this.current.loadSource(source);
      this.current.startLoad(-1);
      return;
    }
    this.beginHandoff(source);
  }

  startLoad(startPosition = -1): void {
    this.current.startLoad(startPosition);
    this.pending?.hls.startLoad(startPosition);
  }

  stopLoad(): void {
    this.current.stopLoad();
    this.pending?.hls.stopLoad();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPending();
    this.current.destroy();
  }

  private prepareVideo(video: HTMLVideoElement, active: boolean): void {
    video.autoplay = true;
    video.playsInline = true;
    video.dataset.playbackActive = String(active);
    video.style.cssText = `position:absolute;inset:0;width:100%;height:100%;background:#000;display:block;opacity:${active ? '1' : '0'};pointer-events:none`;
  }

  private beginHandoff(source: string): void {
    this.cancelPending();
    const video = document.createElement('video');
    this.prepareVideo(video, false);
    video.muted = true;
    video.volume = 0;
    this.host.insertBefore(video, this.host.firstChild?.nextSibling ?? null);
    const next = new Hls(this.config);
    let manifest: [Events, any] | undefined;
    let level: [Events, any] | undefined;
    const ready = () => this.promote(next, video, source, manifest, level);
    const onManifest = (event: Events, data: any) => { manifest = [event, data]; };
    const onLevel = (event: Events, data: any) => { level = [event, data]; };
    const onError = (_event: Events, data: { fatal?: boolean }) => { if (data.fatal) this.cancelPending(next, true); };
    const cleanup = () => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('playing', ready);
      next.off(Events.MANIFEST_PARSED, onManifest as never);
      next.off(Events.LEVEL_LOADED, onLevel as never);
      next.off(Events.ERROR, onError as never);
    };
    const timeout = window.setTimeout(() => this.cancelPending(next, true), 15000);
    this.pending = { hls: next, video, source, timeout, cleanup };
    next.on(Events.MANIFEST_PARSED, onManifest as never);
    next.on(Events.LEVEL_LOADED, onLevel as never);
    next.on(Events.ERROR, onError as never);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', ready);
    next.loadSource(source);
    next.attachMedia(video);
    next.startLoad(-1);
    void video.play().catch(() => undefined);
  }

  private promote(next: Hls, video: HTMLVideoElement, source: string, manifest?: [Events, any], level?: [Events, any]): void {
    const pending = this.pending;
    if (!pending || pending.hls !== next || this.destroyed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    window.clearTimeout(pending.timeout);
    pending.cleanup();
    this.pending = undefined;

    const previous = this.current;
    const previousVideo = this.currentVideo;
    for (const [event, registered] of this.listeners) {
      for (const listener of registered) next.on(event, listener as never);
    }
    this.current = next;
    this.currentVideo = video;
    this.currentSource = source;
    this.onVideoChanged(video, source);
    video.dataset.playbackActive = 'true';
    video.style.opacity = '1';
    previousVideo.dataset.playbackActive = 'false';
    previousVideo.style.opacity = '0';
    previous.destroy();
    previousVideo.remove();

    // The standby instance parsed these before its listeners became public.
    // Replay the latest state after promotion so controls and ad tracking are
    // synchronized with the video that is now on screen.
    if (manifest) this.emit(manifest[0], manifest[1]);
    if (level) this.emit(level[0], level[1]);
  }

  private emit(event: Events, data: any): void {
    for (const listener of this.listeners.get(event) ?? []) listener(event, data);
  }

  private cancelPending(expected?: Hls, notify = false): void {
    const pending = this.pending;
    if (!pending || (expected && pending.hls !== expected)) return;
    this.pending = undefined;
    window.clearTimeout(pending.timeout);
    pending.cleanup();
    pending.hls.destroy();
    pending.video.remove();
    if (notify) this.onHandoffFailed?.(pending.source);
  }
}
