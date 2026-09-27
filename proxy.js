import { Readable } from 'node:stream';

import { findChannel, isProxyable } from './data/channels.js';

const FETCH_TIMEOUT_MS = 20000;
const STREAM_IDLE_MS = 45000;
const PLAYLIST_CACHE_TTL_MS = 1500;
const PLAYLIST_RETRIES = 2;
const MAX_REDIRECTS = 5;

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

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      },
      { once: true }
    );
  });
}

// Block obviously-private / loopback hosts to avoid turning the proxy into an
// SSRF vector. The proxy is already gated to catalogue channels.
export function isBlockedHost(hostname) {
  if (!hostname) return true;
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');

  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;

  const v4dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4dotted) return isBlockedHost(v4dotted[1]);
  // Node rewrites [::ffff:127.0.0.1] to [::ffff:7f00:1].
  const v4hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4hex) {
    const hi = Number.parseInt(v4hex[1], 16);
    const lo = Number.parseInt(v4hex[2], 16);
    return isBlockedHost(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }

  if (h.includes(':')) {
    const compacted = h.replace(/^0+/, '').toLowerCase();
    if (compacted.startsWith('fe80:')) return true;
    if (compacted.startsWith('fc') || compacted.startsWith('fd')) return true;
  }

  return false;
}

export function isBlockedTarget(url) {
  return !/^https?:$/.test(url.protocol) || isBlockedHost(url.hostname);
}

export function looksLikePlaylist(url, contentType, body) {
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
export function rewritePlaylist(text, baseUrl, channelId) {
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

async function fetchFollow(url, headers, signal, hops = 0) {
  if (hops > MAX_REDIRECTS) {
    throw Object.assign(new Error('too_many_redirects'), { code: 'REDIRECTS' });
  }
  if (isBlockedTarget(url)) {
    throw Object.assign(new Error('blocked_target'), { code: 'BLOCKED' });
  }

  const upstream = await fetch(url.href, { headers, signal, redirect: 'manual' });
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location');
    if (!location) return upstream;
    let next;
    try {
      next = new URL(location, url);
    } catch {
      throw Object.assign(new Error('bad_redirect'), { code: 'BLOCKED' });
    }
    return fetchFollow(next, headers, signal, hops + 1);
  }
  return { response: upstream, finalUrl: url.href };
}

async function fetchUpstream(url, headers, signal, { retries = 0 } = {}) {
  let lastErr;
  let last;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      last = await fetchFollow(url, headers, signal);
      const status = last.response.status;
      if (last.response.ok || (status < 500 && status !== 429)) return last;
      lastErr = Object.assign(new Error(`upstream ${status}`), { status });
    } catch (err) {
      if (err.code === 'BLOCKED' || err.code === 'REDIRECTS' || err.name === 'AbortError') {
        throw err;
      }
      lastErr = err;
    }
    if (attempt < retries) {
      await delay(350 * (attempt + 1), signal);
    }
  }

  if (last) return last;
  throw lastErr || new Error('upstream_fetch_failed');
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range, Accept-Ranges');
}

function pipeUpstream(upstream, req, res, signal) {
  if (!upstream.body) {
    res.end();
    return;
  }

  let nodeStream;
  try {
    nodeStream = Readable.fromWeb(upstream.body);
  } catch {
    res.end();
    return;
  }

  const idle = setTimeout(() => {
    nodeStream.destroy();
    if (!res.writableEnded) res.destroy();
  }, STREAM_IDLE_MS);

  const bumpIdle = () => {
    idle.refresh?.();
  };
  nodeStream.on('data', bumpIdle);

  const abort = () => {
    clearTimeout(idle);
    nodeStream.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  nodeStream.on('error', abort);
  nodeStream.on('end', () => clearTimeout(idle));
  res.on('close', abort);
  nodeStream.pipe(res);
}

export function createProxyHandler() {
  return async function proxyHandler(req, res) {
    applyCors(res);

    const channel = findChannel(req.params.id);
    if (!isProxyable(channel)) {
      return res.status(404).json({ error: 'not_proxyable', id: req.params.id });
    }

    const target = req.query.u ? String(req.query.u) : channel.stream;

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return res.status(400).json({ error: 'bad_target' });
    }
    if (isBlockedTarget(targetUrl)) {
      return res.status(400).json({ error: 'blocked_target' });
    }

    const cacheKey = `${channel.id}|${targetUrl.href}`;
    const maybePlaylist = /\.m3u8(\?|$)/i.test(targetUrl.href);
    if (maybePlaylist) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(cached);
      }
    }

    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (channel.headers?.userAgent) headers['User-Agent'] = channel.headers.userAgent;
    if (channel.headers?.referer) headers.Referer = channel.headers.referer;
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers['if-range']) headers['If-Range'] = req.headers['if-range'];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const onClientGone = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on('close', onClientGone);

    let fetched;
    try {
      fetched = await fetchUpstream(targetUrl, headers, controller.signal, {
        retries: maybePlaylist ? PLAYLIST_RETRIES : 0,
      });
    } catch (err) {
      clearTimeout(timeout);
      req.off('close', onClientGone);
      if (err.code === 'BLOCKED' || err.code === 'REDIRECTS') {
        return res.status(400).json({ error: 'blocked_target' });
      }
      if (err.name === 'AbortError') {
        if (!res.headersSent) return res.status(499).json({ error: 'client_aborted' });
        return;
      }
      return res.status(502).json({ error: 'upstream_fetch_failed', message: String(err) });
    }
    clearTimeout(timeout);
    req.off('close', onClientGone);

    const { response: upstream, finalUrl } = fetched;

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: 'upstream_error', status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || '';

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

    if (upstream.status === 206) res.status(206);
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=4');

    const streamController = new AbortController();
    const onGone = () => {
      if (!res.writableEnded) streamController.abort();
    };
    req.on('close', onGone);
    pipeUpstream(upstream, req, res, streamController.signal);
  };
}
