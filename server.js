import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { channels, findChannel, countryFlags, shouldProxy, isPlayable } from './data/channels.js';
import { createProxyHandler } from './proxy.js';

// Direct CORS-friendly HTTPS streams play from the origin; everything else
// (HTTP, missing CORS, extra headers) goes through the same-origin proxy.
function playUrlFor(channel) {
  if (!isPlayable(channel)) return null;
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', channels: channels.length, uptime: process.uptime() });
});

app.get('/api/channels', (_req, res) => {
  res.json({
    count: channels.length,
    countryFlags,
    channels: channels.map(toPublicChannel),
  });
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
  app.listen(PORT, HOST, () => {
    console.log(`Latvijas.tv free is running at http://${HOST}:${PORT}`);
  });
}

export default app;
