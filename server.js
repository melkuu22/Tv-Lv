import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { channels, findChannel, countryFlags, bouquets, shouldProxy, isPlayable } from './data/channels.js';
import { createProxyHandler } from './proxy.js';
import { LIVE_DIR, liveMuxStatus, startLiveMux, stopLiveMux } from './live-mux.js';
import { fetchRigaWeather } from './public/widgets.js';

// Same-origin play: local mux at /live, everything else through /proxy/:id.
function playUrlFor(channel) {
  if (!isPlayable(channel)) return null;
  if (channel.local) return channel.stream;
  return shouldProxy(channel) ? `/proxy/${channel.id}` : channel.stream;
}

function toPublicChannel(channel) {
  return { ...channel, playUrl: playUrlFor(channel) };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

app.disable('x-powered-by');
// Do not gzip HLS media — it wastes CPU and adds live latency.
app.use(
  compression({
    filter(req, res) {
      if (req.path.startsWith('/proxy/')) return false;
      return compression.filter(req, res);
    },
  })
);
// Skip HTTP request logging under the test runner to keep test output clean.
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Minimal, dependency-free security headers.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Serve the bundled hls.js player library from the installed dependency so the
// app works fully offline without relying on a public CDN.
app.use(
  '/vendor/hls.js',
  express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist'))
);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/live/index.m3u8', (req, res, next) => {
  const live = liveMuxStatus();
  if (live.ready) return next();
  res.status(503).json({ error: live.error || 'live_unavailable' });
});

app.use(
  '/live',
  express.static(LIVE_DIR, {
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    channels: channels.length,
    uptime: process.uptime(),
    live: liveMuxStatus(),
  });
});

app.get('/api/channels', (_req, res) => {
  res.json({
    count: channels.length,
    countryFlags,
    bouquets,
    channels: channels.map(toPublicChannel),
  });
});

app.get('/api/weather', async (_req, res) => {
  try {
    const weather = await fetchRigaWeather();
    res.json(weather);
  } catch {
    res.status(502).json({ error: 'weather_unavailable', city: 'Rīga' });
  }
});

app.get('/api/channels/:id', (req, res) => {
  const channel = findChannel(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'channel_not_found', id: req.params.id });
  }
  res.json(toPublicChannel(channel));
});

// HLS proxy for catalogue streams (CORS, mixed-content, header injection).
app.get('/proxy/:id', createProxyHandler());

// Only start the HTTP server when run directly (not when imported by tests).
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const remotes = channels.filter((c) => c.live && /^https?:\/\//.test(c.stream || '')).map((c) => c.stream);
  startLiveMux(remotes).catch((err) => {
    console.error('live mux failed to start', err);
  });
  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Latvijas.tv free is running at http://${HOST}:${PORT}`);
  });
  const shutdown = () => {
    stopLiveMux();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
