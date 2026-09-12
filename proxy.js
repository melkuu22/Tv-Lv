import { Readable } from 'node:stream';

import { findChannel } from './data/channels.js';

const FETCH_TIMEOUT_MS = 15000;
const PLAYLIST_CACHE_TTL_MS = 2000;

// Tiny in-memory cache for rewritten playlists. Live playlists change every few
// seconds, so a very short TTL smooths out rapid re-requests (e.g. a viewer
// flicking between channels) without serving stale media.
const playlistCache = new Map();

function cacheGet(key) {
  const entry = playlistCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > PLAYLIST_CACHE_TTL_MS) {
    playlistCache.delete(key);
    return null;
  }
  return entry.body;
}

function cacheSet(key, body) {
  // Bound memory: drop the oldest entry once the cache grows too large.
  if (playlistCache.size > 200) {
    playlistCache.delete(playlistCache.keys().next().value);
  }
  playlistCache.set(key, { body, at: Date.now() });
}

// Block obviously-private / loopback hosts to avoid turning the proxy into an
// SSRF vector. The proxy is already gated to channels that opt in (proxy:true),
// but this is a cheap extra guard.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function looksLikePlaylist(url, contentType, body) {
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  if (contentType && /mpegurl/i.test(contentType)) return true;
  if (body && body.trimStart().startsWith('#EXTM3U')) return true;
  return false;
}

function proxiedUrl(channelId, absoluteUrl) {
  return `/proxy/${encodeURIComponent(channelId)}?u=${encodeURIComponent(absoluteUrl)}`;
}

// Rewrite every URI in an HLS playlist so the browser fetches it back through
// this proxy (same-origin), which is what lets no-CORS / header-restricted
// upstreams play in the browser.
function rewritePlaylist(text, baseUrl, channelId) {
  const rewriteAbs = (uri) => {
    try {
      return proxiedUrl(channelId, new URL(uri, baseUrl).href);
    } catch {
      return uri;
    }
  };

  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line === '') return line;
      if (line.startsWith('#')) {
        // Rewrite URI="..." attributes (EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, ...).
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${rewriteAbs(uri)}"`);
      }
      return rewriteAbs(line);
    })
    .join('\n');
}

export function createProxyHandler() {
  return async function proxyHandler(req, res) {
    const channel = findChannel(req.params.id);
    // Always advertise CORS so the player can read both playlists and error JSON.
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!channel || !channel.proxy) {
      return res.status(404).json({ error: 'not_proxyable', id: req.params.id });
    }

    const target = req.query.u ? String(req.query.u) : channel.stream;

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return res.status(400).json({ error: 'bad_target' });
    }
    if (!/^https?:$/.test(targetUrl.protocol) || isBlockedHost(targetUrl.hostname)) {
      return res.status(400).json({ error: 'blocked_target' });
    }

    const cacheKey = `${channel.id}|${targetUrl.href}`;
    const maybePlaylist = /\.m3u8(\?|$)/i.test(targetUrl.href);
    if (maybePlaylist) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(cached);
      }
    }

    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (channel.headers?.userAgent) headers['User-Agent'] = channel.headers.userAgent;
    if (channel.headers?.referer) headers.Referer = channel.headers.referer;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let upstream;
    try {
      upstream = await fetch(targetUrl.href, { headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      return res.status(502).json({ error: 'upstream_fetch_failed', message: String(err) });
    }
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'upstream_error', status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const finalUrl = upstream.url || targetUrl.href;

    // Peek only when it might be a playlist; otherwise stream bytes straight through.
    if (looksLikePlaylist(finalUrl, contentType)) {
      const body = await upstream.text();
      if (looksLikePlaylist(finalUrl, contentType, body)) {
        const rewritten = rewritePlaylist(body, finalUrl, channel.id);
        cacheSet(cacheKey, rewritten);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(rewritten);
      }
      res.setHeader('Content-Type', contentType || 'text/plain');
      return res.send(body);
    }

    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  };
}
