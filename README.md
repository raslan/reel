# Reel

A self-hosted web app for playing a folder-based audio library — for audio that isn't necessarily music: podcasts, field recordings, ASMR, voice memos, lectures, anything in a folder.

Reel is a file browser first and a player second. You navigate nested folders, click a file to play it, and get player controls that make sense for spoken/recorded audio: seek, ±5s skip, 0.5–2× speed (pitch preserved), volume, and next/prev within the current folder. You can also favorite files and search by filename.

There are deliberately no music-library concepts: no albums, artists, genres, tags, or playlists. The only user-created categorization is a file-level favorite.

**Supported formats:** `.wav` `.mp3` `.ogg` `.oga` `.flac` `.m4a` `.aac` `.opus`. Other files are ignored.

## How it works

One container, one HTTP port (8080). It needs exactly two things:

| Mount | Access | Purpose |
|---|---|---|
| `/libraries` | **read-only** | Your audio. Each immediate subdirectory is one library (or mount libraries individually — see the compose example). The app never writes here. |
| `/data` | writable | The index and favorites (SQLite). Survives container rebuilds; lives on a Docker volume. |

The index is built at startup and can be rescanned from the UI.

## Install with Docker Compose

A ready-to-edit compose file is in the repo (`docker-compose.yml`). Edit the library path, then build and start:

```yaml
services:
  reel:
    image: ghcr.io/raslan/reel:latest 
    volumes:
      # One tree at /libraries: its immediate subdirectories become the libraries.
      - /absolute/path/to/your/audio:/libraries:ro
      # …or mount each library explicitly:
      # - /absolute/path/to/podcasts:/libraries/Podcasts:ro
      # - /absolute/path/to/field:/libraries/Field:ro
      - reel-data:/data
    restart: unless-stopped

volumes:
  reel-data:
```

```bash
docker compose up -d --build
```

## Install with docker run

```bash
docker build -t reel .

docker run -d --name reel \
  -p 8080:8080 \
  -v /absolute/path/to/your/audio:/libraries:ro \
  -v reel-data:/data \
  --restart unless-stopped \
  reel
```

Then open http://localhost:8080 (or your host's address). The health endpoint is `GET /api/health`.

## Permissions

The container starts as root only long enough to give `/data` to an unprivileged user, then runs the server as that
user (UID/GID 1000 by default). Existing installs with a root-owned `/data` keep working. Reel only reads
`/libraries`, so the files there must be readable by that user. If they aren't, set `PUID` / `PGID`, e.g.
`-e PUID=1001 -e PGID=1001`. Passing `--user` to Docker skips the ownership step entirely.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Back / forward 5 seconds |
| `M` | Mute / unmute |
| `S` | Cycle playback speed |
| `R` | Cycle repeat: off → whole list → this file |
| `Esc` | Close the zen player |

On the focused seek bar, `Home` / `End` jump to the start / near the end. Shortcuts are ignored while you type
in a search box.

## Notes

- The bottom bar is a timeline: the waveform runs across the top (click or drag to seek), with the title,
  transport, speed, repeat and volume below it. On a phone the transport gets its own row and volume is left
  to the device's buttons. Tap the title or ⤢ for the full-screen player.
- Next / previous follow the list you started playing from (a folder, search results, or your favorites).
  With "repeat whole list" on, they wrap around the ends and playback loops.
- Changes on disk are picked up automatically: Reel watches the libraries and re-indexes a few seconds after
  things settle. Network mounts (NFS/SMB) don't deliver file events, so there's also a full re-index every 15
  minutes; Rescan in Settings does it on demand. Unplayable files are skipped during continuous play.
- Sort by name, length, date modified or size (date and size start newest / biggest first; click again to
  reverse). Volume, speed, repeat and sort are remembered in the browser.
- The address bar follows you (`#/library/Podcasts/Ep%201`, `#/favorites`, …): Back walks up folders, refresh
  keeps your place, and a folder can be bookmarked.
- Media keys, headset buttons and the lock screen / notification controls work (previous, next, play/pause,
  ±5s, drag-to-seek) wherever the browser supports the Media Session API.
- Reel has a web manifest and icons, so "Add to Home screen" / "Install app" gives it its own window and icon.
  Chrome only offers a real install over HTTPS (or `localhost`); on a plain-HTTP LAN address you still get the
  shortcut and icon. There's no offline mode: the library lives on your server.

- Favorites and the index live in the `reel-data` volume, not in your library — the library mount is read-only and is never written to.
- To move or upgrade, keep the `reel-data` volume; rebuild the image and your favorites and durations come back.
- Large files seek instantly: audio is served with HTTP `Range` support (206).
