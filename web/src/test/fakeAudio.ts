/**
 * Stand-in for HTMLAudioElement in jsdom (which doesn't implement media playback).
 * It plays, pauses and fires the events the engine listens for; tests drive the rest.
 */
export class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  static last(): FakeAudio {
    const a = FakeAudio.instances.at(-1);
    if (a === undefined) throw new Error("no FakeAudio created yet");
    return a;
  }

  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  volume = 1;
  preservesPitch = false;
  error: { code: number } | null = null;
  /** Make play() reject like a blocked autoplay. */
  rejectPlay = false;
  /** Every src this element has been pointed at, in order. */
  loads: string[] = [];
  #src = "";

  constructor() {
    super();
    FakeAudio.instances.push(this);
  }

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    if (value !== "") this.loads.push(value);
  }

  play(): Promise<void> {
    if (this.rejectPlay) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    if (this.#src !== "" && this.paused) {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
    }
    return Promise.resolve();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  removeAttribute(): void {
    this.#src = "";
  }

  load(): void {}

  /** The browser reaching the end of the media. */
  finish(): void {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
    this.dispatchEvent(new Event("ended"));
  }

  /** The browser failing to load/decode with a MediaError code. */
  fail(code: number): void {
    this.error = { code };
    this.paused = true;
    this.dispatchEvent(new Event("error"));
  }
}
