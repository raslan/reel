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

## Notes

- Favorites and the index live in the `reel-data` volume, not in your library — the library mount is read-only and is never written to.
- To move or upgrade, keep the `reel-data` volume; rebuild the image and your favorites and durations come back.
- Large files seek instantly: audio is served with HTTP `Range` support (206).
