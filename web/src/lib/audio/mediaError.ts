export interface MediaFailure {
  /** User-facing, plain English. */
  message: string;
  /** True when the file itself is the problem (skip it); false when retrying later could work. */
  dead: boolean;
}

/** Map an HTMLMediaElement MediaError code to what happened and whether the file is to blame. */
export function describeMediaError(name: string, code: number | null): MediaFailure {
  switch (code) {
    case 1: // MEDIA_ERR_ABORTED
    case 2: // MEDIA_ERR_NETWORK
      return { message: `Network problem while playing "${name}". Try again.`, dead: false };
    case 3: // MEDIA_ERR_DECODE
      return { message: `"${name}" is corrupted and can't be decoded.`, dead: true };
    default: // MEDIA_ERR_SRC_NOT_SUPPORTED (a 404 shows up as this) or unknown
      return { message: `"${name}" is missing or in an unsupported format.`, dead: true };
  }
}
