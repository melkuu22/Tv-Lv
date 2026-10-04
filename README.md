# Tv-Lv — Latvijas.tv free

A small, free web app for watching publicly available **Latvian, Russian,
Ukrainian and English TV** channels in the browser. It ships a modern channel
guide with search, country filters and favourites, plus an in-browser HLS
player and a built-in stream proxy.

## Features

- **27 channels** in set-top-style bouquets (🇱🇻 LV #1–#2, 🇷🇺 RU #1–#2,
  🇺🇦 UA #1, 🇬🇧 EN #1–#2). The player starts on **Latvijas.tv Live**, a
  same-origin HLS mux the server keeps up from a live upstream (ffmpeg).
  The list includes LTV1, LTV7, Re:TV, TV3 Life, TV Jūrmala, TVNET,
  Мир 24, РБК, 360°, RTG TV, ТНТ, Пятница!, Ю, 2x2, 24 Канал, 1+1,
  France 24, Al Jazeera, DW, CGTN, Bloomberg, Arirang, and a last-resort
  demo stream. Pay-TV packages (Disney, Discovery, Eurosport, Match) are
  not included — only openly published streams.
- **Search + bouquet tabs + favourites** (favourites persist in
  `localStorage`).
- **In-browser HLS playback** via [`hls.js`](https://github.com/video-dev/hls.js)
  (bundled locally, no CDN required), tuned for regular live HLS (not
  low-latency), with a recovery session: network/media repair, audio-codec
  swap, full player restart, same-origin proxy fallback, live-edge catch-up,
  stall watchdog, and auto-resume on reconnect or tab focus.
- **Built-in HLS proxy** (`/proxy/:id`) that adds CORS headers and optional
  upstream request headers, so streams whose segments lack CORS still play in
  the browser. Follows redirects safely, retries playlist fetches, aborts work
  when the viewer switches away, and is gated to known channels with an SSRF
  guard.
- **Keyboard shortcuts**: `↑`/`↓` to switch channels, `/` to focus search,
  `m` to unmute, `r` to retry the current channel.
- Channels with no free live feed (e.g. Дом-2, blocked by the rights holder)
  are listed but clearly marked unavailable, with a one-tap jump back to
  Demo Kanāls. Dead or geo-blocked streams never take the app down.
- Simple JSON API and a `/api/health` endpoint.

## Tech stack

- Node.js (>= 20) + [Express](https://expressjs.com/)
- Vanilla HTML/CSS/JS frontend
- `hls.js` for adaptive streaming
- Zero-dependency HLS proxy (`proxy.js`)

## Getting started

```bash
npm install      # install dependencies
npm start        # start the server on http://localhost:3000
```

Then open <http://localhost:3000> and pick a channel.

For live-reload during development:

```bash
npm run dev
```

## Docker

```bash
docker build -t tv-lv .
docker run --rm -p 3000:3000 tv-lv
```

## API

| Endpoint                | Description                                  |
| ----------------------- | -------------------------------------------- |
| `GET /api/health`       | Health check + channel count + live mux      |
| `GET /live/index.m3u8`  | Local live HLS (ffmpeg restream)             |
| `GET /api/channels`     | Full catalogue (`playUrl`, `countryFlags`, `bouquets`) |
| `GET /api/channels/:id` | A single channel by id                       |
| `GET /proxy/:id`        | HLS proxy for any playable catalogue stream |

## Tests

```bash
npm test
```

Continuous integration runs the test suite and a Docker build on every push and
pull request (see `.github/workflows/ci.yml`).

## Project layout

```
server.js          Express app + JSON API + proxy mount
proxy.js           Same-origin HLS proxy (CORS + header injection + rewriting)
data/channels.js   Channel catalogue
public/            Frontend (index.html, styles.css, app.js, playback.js)
test/              API + proxy tests (node:test)
Dockerfile         Production container image
.cursor/           Cloud Agent dev environment config
```

## Notes & disclaimer

Live TV stream URLs come from openly published channel lists and may change or be
geo-restricted over time. The bundled **Demo Kanāls** uses a stable public test
stream so the player always has something to play. All channels and their
content belong to their respective owners; this project only links to publicly
available streams for demonstration and educational purposes.

## License

[MIT](./LICENSE)
