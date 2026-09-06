# Tv-Lv — Latvijas.tv free

A small, free web app for watching publicly available **Latvian TV** channels in
the browser. It ships a modern channel guide and an in-browser HLS player.

## Features

- Curated catalogue of freely available Latvian channels (Re:TV, TV Jūrmala,
  TVNET, Radio SWH TV, Vidusdaugavas TV) plus an always-available demo stream.
- In-browser HLS playback via [`hls.js`](https://github.com/video-dev/hls.js)
  (bundled locally, no CDN required).
- Simple JSON API (`/api/health`, `/api/channels`, `/api/channels/:id`).

## Tech stack

- Node.js (>= 20) + [Express](https://expressjs.com/)
- Vanilla HTML/CSS/JS frontend
- `hls.js` for adaptive streaming

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

## API

| Endpoint              | Description                     |
| --------------------- | ------------------------------- |
| `GET /api/health`     | Health check + channel count    |
| `GET /api/channels`   | Full channel catalogue          |
| `GET /api/channels/:id` | A single channel by id        |

## Tests

```bash
npm test
```

## Notes

Live TV stream URLs come from openly published channel lists and may change or be
geo-restricted over time. The bundled **Demo Kanāls** uses a stable public test
stream so the player always has something to play.
