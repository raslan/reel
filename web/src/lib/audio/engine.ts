export type EngineEvent = "play" | "pause" | "ended" | "error" | "duration" | "seeked";
export type Sink = (position: number, duration: number) => void;

/** Seconds kept before the end when seeking, so a seek can never itself end (and advance) the track. */
const SEEK_TAIL = 1;

/**
 * The app's single audio element. Components subscribe to `sink` (60fps
 * position/duration, for direct DOM writes) and named events; they never
 * read the element themselves.
 */
export class AudioEngine {
  private audio: HTMLAudioElement;
  private sinks = new Set<Sink>();
  private listeners = new Map<EngineEvent, Set<(path?: string) => void>>();
  private raf = 0;
  /** Non-null while a scrub gesture is active; holds whether to resume after. */
  private scrubResume: boolean | null = null;
  currentPath: string | null = null;

  constructor(audio?: HTMLAudioElement) {
    this.audio = audio ?? new Audio();
    this.audio.preservesPitch = true;
    this.audio.addEventListener("play", () => {
      this.startLoop();
      this.emit("play");
    });
    this.audio.addEventListener("pause", () => {
      this.stopLoop();
      // A scrub pauses internally; the UI should keep showing "playing".
      if (this.scrubResume === null) this.emit("pause");
    });
    this.audio.addEventListener("ended", () => {
      this.stopLoop();
      this.pushSinks(); // the loop's last frame is short of the end
      // Never auto-advance because of where a drag happened to land.
      if (this.scrubResume === null) this.emit("ended");
    });
    this.audio.addEventListener("loadedmetadata", () => {
      this.pushSinks(); // duration is known now, even if nothing is playing
      this.emit("duration");
    });
    this.audio.addEventListener("seeked", () => this.emit("seeked"));
    // One listener for the element's lifetime. A newer load() cancels the older
    // load's pending events, so an error here always belongs to `currentPath`.
    this.audio.addEventListener("error", () => {
      if (this.currentPath !== null) this.emit("error", this.currentPath);
    });
  }

  /** Load (and optionally autoplay) a library file. */
  load(path: string, autoplay: boolean): void {
    this.scrubResume = null;
    this.currentPath = path;
    this.audio.src = `/audio/${encodeURIComponent(path)}`;
    this.pushSinks(); // new file: position is back at 0, duration unknown
    if (autoplay) this.tryPlay();
  }

  play(): void {
    this.tryPlay();
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): void {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  /** Seek, staying short of the very end (see SEEK_TAIL). Also moves the playhead while paused. */
  seek(t: number): void {
    // currentTime throws on NaN/Infinity (e.g. a pointer position computed against a 0-width bar).
    if (!Number.isFinite(t)) return;
    const d = this.audio.duration;
    const max = Number.isFinite(d) && d > 0 ? Math.max(0, d - SEEK_TAIL) : Number.POSITIVE_INFINITY;
    this.audio.currentTime = Math.min(Math.max(0, t), max);
    this.pushSinks(); // the rAF loop is stopped while paused
  }

  /** Start a drag-scrub: hold playback so the playhead can't run off the end mid-drag. */
  beginScrub(): void {
    if (this.scrubResume !== null) return;
    this.scrubResume = !this.audio.paused;
    if (this.scrubResume) this.audio.pause();
  }

  endScrub(): void {
    const resume = this.scrubResume;
    this.scrubResume = null;
    if (resume) this.play();
  }

  seekBy(d: number): void {
    this.seek(this.audio.currentTime + d);
  }

  /**
   * Browsers reset `playbackRate` to `defaultPlaybackRate` whenever a new src
   * loads, so set both or the speed silently reverts on the next file.
   */
  setRate(r: number): void {
    this.audio.defaultPlaybackRate = r;
    this.audio.playbackRate = r;
  }

  setVolume(v: number): void {
    this.audio.volume = Math.min(1, Math.max(0, v));
  }

  getPosition(): number {
    return this.audio.currentTime;
  }

  getDuration(): number {
    const d = this.audio.duration;
    return Number.isFinite(d) ? d : 0;
  }

  /** MediaError code (1 aborted, 2 network, 3 decode, 4 missing/unsupported), or null. */
  getErrorCode(): number | null {
    return this.audio.error?.code ?? null;
  }

  registerSink(fn: Sink): () => void {
    this.sinks.add(fn);
    return () => {
      this.sinks.delete(fn);
    };
  }

  on(event: EngineEvent, fn: (path?: string) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  dispose(): void {
    this.stopLoop();
    this.currentPath = null; // before load(): the "empty src" error it raises isn't a failure
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.sinks.clear();
    this.listeners.clear();
  }

  /** play() rejects when blocked (autoplay policy) or interrupted; the former must not leave the UI "playing". */
  private tryPlay(): void {
    void this.audio.play().catch(() => {
      if (this.audio.paused) this.emit("pause");
    });
  }

  private emit(event: EngineEvent, path?: string): void {
    this.listeners.get(event)?.forEach((fn) => {
      fn(path);
    });
  }

  private pushSinks(): void {
    this.sinks.forEach((fn) => {
      fn(this.audio.currentTime, this.getDuration());
    });
  }

  private startLoop(): void {
    if (this.raf !== 0) return;
    const tick = (): void => {
      this.raf = 0;
      this.pushSinks();
      if (!this.audio.paused) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }
}
