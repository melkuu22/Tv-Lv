# Tv-Lv — Latvijas.tv free

A small, free web app for watching publicly available **Latvian, Russian,
Ukrainian and English TV** channels in the browser. It ships a modern channel
guide with search, country filters and favourites, plus an in-browser HLS
player and a built-in stream proxy.

## Features

- **15 channels** grouped by country with flags (🇱🇻 🇷🇺 🇺🇦 🇬🇧), including
  Re:TV, TV Jūrmala, TVNET, ТНТ, Пятница!, Ю, 24 Канал, 1+1, France 24
  English, Al Jazeera English, DW English, and an always-available demo stream.
- **Search + country filters + favourites** (favourites persist in
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
| `GET /api/health`       | Health check + channel count                 |
| `GET /api/channels`     | Full catalogue (`playUrl`, `countryFlags`)   |
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
