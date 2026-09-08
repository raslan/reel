export type EngineEvent = "play" | "pause" | "ended" | "error" | "duration" | "seeked";
export type Sink = (position: number, duration: number) => void;

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
  private token = 0;
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
      this.emit("pause");
    });
    this.audio.addEventListener("ended", () => {
      this.stopLoop();
      this.emit("ended");
    });
    this.audio.addEventListener("loadedmetadata", () => this.emit("duration"));
    this.audio.addEventListener("seeked", () => this.emit("seeked"));
  }

  /** Load (and optionally autoplay) a library file. */
  load(path: string, autoplay: boolean): void {
    this.token += 1;
    const t = this.token;
    this.currentPath = path;
    const onError = () => {
      // Token guard: an aborted load's error must not flag the new file.
      if (t === this.token) this.emit("error", path);
    };
    this.audio.addEventListener("error", onError, { once: true });
    this.audio.src = `/audio/${encodeURIComponent(path)}`;
    if (autoplay) void this.audio.play().catch(() => undefined);
  }

  play(): void {
    void this.audio.play().catch(() => undefined);
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): void {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  seek(t: number): void {
    const d = this.audio.duration;
    const clamped =
      Number.isFinite(d) && d > 0 ? Math.min(Math.max(0, t), d - 0.05) : Math.max(0, t);
    this.audio.currentTime = clamped;
  }

  seekBy(d: number): void {
    this.seek(this.audio.currentTime + d);
  }

  setRate(r: number): void {
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
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.currentPath = null;
    this.sinks.clear();
    this.listeners.clear();
  }

  private emit(event: EngineEvent, path?: string): void {
    this.listeners.get(event)?.forEach((fn) => {
      fn(path);
    });
  }

  private startLoop(): void {
    if (this.raf !== 0) return;
    const tick = (): void => {
      this.raf = 0;
      this.sinks.forEach((fn) => {
        fn(this.audio.currentTime, this.getDuration());
      });
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
