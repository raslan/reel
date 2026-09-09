# Changelog

## 1.0.0 (2026-09-09)


### Features

* add gitignore entires ([620d864](https://github.com/raslan/reel/commit/620d864af3da151ae598e5f26e2d0f6708799902))
* add LICENSE, README and fix a quick height bug ([a8760cd](https://github.com/raslan/reel/commit/a8760cd532737652efdc31e7631cc56f8f998e66))
* **api:** scope /api/search by folder; include size in results ([f63d492](https://github.com/raslan/reel/commit/f63d4920456f8ad336700b6dd5cbab77132bcc9d))
* Docker packaging (bun alpine + ffmpeg) and compose example ([5c5e57f](https://github.com/raslan/reel/commit/5c5e57f046f6dae12e18b0a6ec10fe06d370a05d))
* ffmpeg peaks pipeline with FIFO queue and per-mtime failure latch ([7b3b1b1](https://github.com/raslan/reel/commit/7b3b1b1f5c76a0248b5854b01b3f68fb55e7b48c))
* ffprobe duration pass and per-library rescan ([30e82c5](https://github.com/raslan/reel/commit/30e82c513de3f9d4f09ebd84833bc03cdb4f460f))
* fs.watch library watching with 700ms debounce ([b34bd8c](https://github.com/raslan/reel/commit/b34bd8cb0fc8db349d4ab672d79af2a17d26d42a))
* hono app with health, libraries, list endpoints ([8207d9a](https://github.com/raslan/reel/commit/8207d9a15c9614ac34306daf3d22fa1f0d95cf88))
* in-process event bus for SSE fan-out ([3e0e1cd](https://github.com/raslan/reel/commit/3e0e1cd55ef0ff39de3674c5a872e3d72b4face3))
* library walk, index diffing, candidate discovery ([4fbc914](https://github.com/raslan/reel/commit/4fbc914943f6eb1344bd3bce6802bb172ba1ba0e))
* manual rescan endpoint and SSE event stream ([139a638](https://github.com/raslan/reel/commit/139a6387f617286511aba20e62d68aae5b2500bb))
* peaks endpoint with ready/pending/failed state machine ([8bff94e](https://github.com/raslan/reel/commit/8bff94ee54409e941228a44eb3d1b00ea0a42178))
* root resolution for /libraries and /data with dev fallbacks ([39844d1](https://github.com/raslan/reel/commit/39844d1d2bf9cc97fbb72f006f52558741ceb6a8))
* search and favorites endpoints ([98c323e](https://github.com/raslan/reel/commit/98c323eaba6a384d526f89b709491105e483198b))
* server entry composing db, bus, peaks, watchers, routes ([6aa2985](https://github.com/raslan/reel/commit/6aa2985c2b8377c07ad52c1335da73478e9e9c46))
* sqlite schema and query helpers (files, favorites, peaks, settings) ([83ff22c](https://github.com/raslan/reel/commit/83ff22ca68cab5c6ae910d5857b9773036fbcfa6))
* updates to audio library resetting ([b68f35d](https://github.com/raslan/reel/commit/b68f35d81f1bb084911a0390779ba3a152132103))
* **web:** api types and query key factories ([9041d0a](https://github.com/raslan/reel/commit/9041d0a68e1a3de8ca22d9cfde5856accc3a1c53))
* **web:** app shell with sidebar, tab bar, keyboard controls, onboarding gate ([c5bfe0c](https://github.com/raslan/reel/commit/c5bfe0caa0de33f4b17f2a770726acda83c5d81a))
* **web:** audio provider bridging state and engine ([81d46d9](https://github.com/raslan/reel/commit/81d46d9f6664c787612d281e563816691d61fc89))
* **web:** design tokens, deck CSS (grain/brushed/wave/eq/vu), fonts ([7ac513f](https://github.com/raslan/reel/commit/7ac513f9611aa781b2e9cbe6aa74a047cb676c94))
* **web:** duration formatting and folder-path helpers ([c0362d8](https://github.com/raslan/reel/commit/c0362d8aa89208eea4e56582e2aebd4e00410501))
* **web:** folder play-chain stepping ([e44bbd1](https://github.com/raslan/reel/commit/e44bbd117e78748d7aa8b28215ee0eadf1b1fa1e))
* **web:** folder row sorting ([f631fa2](https://github.com/raslan/reel/commit/f631fa2c46d368c81d130625d4b7ce77e5ac8d18))
* **web:** library, search, favorites, settings screens and onboarding ([307e4e6](https://github.com/raslan/reel/commit/307e4e6e7a46f3259168abd71be8e128cdb58ee9))
* **web:** localStorage helpers and waveform tape colors ([2e4a53c](https://github.com/raslan/reel/commit/2e4a53cbce078bbc294689d31027137ddb73f5f8))
* **web:** peak downsampling for waveform bars ([1e100b0](https://github.com/raslan/reel/commit/1e100b08c6ec8903318723a790fd9fa89456d957))
* **web:** player bar and zen player ([b9a3d1b](https://github.com/raslan/reel/commit/b9a3d1b771e874d093745453baa680acb34c5345))
* **web:** shadcn button, slider, switch, sonner, skeleton ([98ed1b0](https://github.com/raslan/reel/commit/98ed1b091c5978553d1d27d0bc937114799bffa9))
* **web:** shared components (EmptyState, Breadcrumbs, SortControl, SearchInput, FolderRow, FileRow, LiveTime, LiveProgress, VirtualRows, SkeletonRows) ([0233e54](https://github.com/raslan/reel/commit/0233e5431f7b846ae4ca5e08f3f556034b03816a))
* **web:** single-element audio engine with sinks and events ([77f619b](https://github.com/raslan/reel/commit/77f619ba469d21e42457512d338013c4c2a08a79))
* **web:** state context, SSE events, TanStack Query hooks ([1ba5e3a](https://github.com/raslan/reel/commit/1ba5e3a74102413d2f5de9b35e58d1a9cc53b080))
* **web:** typed API layer for list/search/favorites/libraries/peaks ([3ea136b](https://github.com/raslan/reel/commit/3ea136b758a28e7fc05abed57c56c24b27ea8ff8))
* **web:** waveform, transport, volume, VU meter, deck status ([29cb37d](https://github.com/raslan/reel/commit/29cb37d351d545c5a02f2b690c00f5d1878f7064))


### Bug Fixes

* favorites survive re-indexing; drop only for removed files ([69560c8](https://github.com/raslan/reel/commit/69560c872f3bf38fe8c8476822fa5c250f249392))
* **web:** global search lists all files on empty query (mockup parity) ([f3d875c](https://github.com/raslan/reel/commit/f3d875ca2223722c3cd9d4ffe45bf5cfc021e9a8))
