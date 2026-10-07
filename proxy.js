import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';
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

// Cloud metadata hostnames that must never be fetched, even before DNS.
const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google',
  'metadata',
]);

// Well-known metadata IPv4s outside (or in addition to) 169.254.0.0/16.
const METADATA_IPV4 = new Set([
  '169.254.169.254',
  '100.100.100.200', // Alibaba
  '168.63.129.16', // Azure IMDS
]);

function parseIPv4Number(part) {
  if (!part) return null;
  let base = 10;
  let digits = part;
  if (part.length >= 2 && part[0] === '0' && (part[1] === 'x' || part[1] === 'X')) {
    base = 16;
    digits = part.slice(2);
  } else if (part.length >= 2 && part[0] === '0') {
    base = 8;
    digits = part.slice(1);
  }
  if (digits === '') return 0;
  const alphabet = base === 16 ? /^[0-9a-f]+$/i : base === 8 ? /^[0-7]+$/ : /^[0-9]+$/;
  if (!alphabet.test(digits)) return null;
  const n = Number.parseInt(digits, base);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
  return n;
}

// WHATWG-style IPv4 parser: dotted decimal, octal, hex, and mixed/short forms
// (127.1, 2130706433, 0x7f000001, 0177.0.0.1) all collapse to four octets.
function parseIPv4(input) {
  const parts = String(input).split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  const nums = [];
  for (const part of parts) {
    const n = parseIPv4Number(part);
    if (n === null) return null;
    nums.push(n);
  }
  const lastMax = [0xffffffff, 0xffffff, 0xffff, 0xff][parts.length - 1];
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] > 0xff) return null;
  }
  if (nums[nums.length - 1] > lastMax) return null;

  let addr = nums[nums.length - 1];
  if (nums.length === 1) {
    // already a 32-bit value
  } else if (nums.length === 2) {
    addr = (nums[0] << 24) + nums[1];
  } else if (nums.length === 3) {
    addr = (nums[0] << 24) + (nums[1] << 16) + nums[2];
  } else {
    addr = (nums[0] << 24) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
  }
  addr >>>= 0;
  return [(addr >>> 24) & 255, (addr >>> 16) & 255, (addr >>> 8) & 255, addr & 255];
}

function parseIPv6(input) {
  let s = String(input).toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);

  const dotted = s.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const v4 = parseIPv4(dotted[1]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, -dotted[1].length)}${hi}:${lo}`;
  }

  let groups;
  if (s.includes('::')) {
    const pieces = s.split('::');
    if (pieces.length !== 2) return null;
    const left = pieces[0] === '' ? [] : pieces[0].split(':');
    const right = pieces[1] === '' ? [] : pieces[1].split(':');
    if (left.length + right.length > 8) return null;
    const fill = 8 - left.length - right.length;
    groups = [...left, ...Array(fill).fill('0'), ...right];
  } else {
    groups = s.split(':');
    if (groups.length !== 8) return null;
  }

  const hextets = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    hextets.push(Number.parseInt(g, 16));
  }
  return hextets.length === 8 ? hextets : null;
}

function hextetsToV4(hi, lo) {
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
}

function embeddedIPv4(hextets) {
  const z = (i) => hextets[i] === 0;
  // IPv4-mapped ::ffff:0:0/96  (Node rewrites [::ffff:a.b.c.d] to [::ffff:aabb:ccdd])
  if (z(0) && z(1) && z(2) && z(3) && z(4) && hextets[5] === 0xffff) {
    return hextetsToV4(hextets[6], hextets[7]);
  }
  // IPv4-translated ::ffff:0:0:0/96
  if (z(0) && z(1) && z(2) && z(3) && hextets[4] === 0xffff && z(5)) {
    return hextetsToV4(hextets[6], hextets[7]);
  }
  // Deprecated IPv4-compatible ::/96, excluding :: and ::1
  if (z(0) && z(1) && z(2) && z(3) && z(4) && z(5)) {
    if (!(z(6) && (z(7) || hextets[7] === 1))) {
      return hextetsToV4(hextets[6], hextets[7]);
    }
  }
  // NAT64 well-known prefix 64:ff9b::/96
  if (hextets[0] === 0x64 && hextets[1] === 0xff9b && z(2) && z(3) && z(4) && z(5)) {
    return hextetsToV4(hextets[6], hextets[7]);
  }
  return null;
}

function isBlockedIPv4(octets) {
  const dotted = octets.join('.');
  if (METADATA_IPV4.has(dotted)) return true;
  const a = octets[0];
  const b = octets[1];
  const c = octets[2];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224 && a <= 239) return true; // multicast 224.0.0.0/4
  if (a >= 240) return true; // 240.0.0.0/4 reserved
  return false;
}

function isBlockedIPv6(hextets) {
  const z = (i) => hextets[i] === 0;
  if (hextets.every((h) => h === 0)) return true; // ::
  if (z(0) && z(1) && z(2) && z(3) && z(4) && z(5) && z(6) && hextets[7] === 1) return true; // ::1
  // AWS IMDS IPv6 fd00:ec2::254 (also ULA, listed explicitly).
  if (
    hextets[0] === 0xfd00 &&
    hextets[1] === 0x0ec2 &&
    z(2) &&
    z(3) &&
    z(4) &&
    z(5) &&
    z(6) &&
    hextets[7] === 0x254
  ) {
    return true;
  }
  const mapped = embeddedIPv4(hextets);
  if (mapped) return isBlockedIPv4(mapped);
  if ((hextets[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((hextets[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((hextets[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

function looksLikeIpLiteral(h) {
  if (h.includes(':')) return true;
  if (net.isIP(h)) return true;
  // Decimal / octal / hex / short IPv4 that net.isIP does not recognize.
  return /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){0,3}$/i.test(h);
}

// Block private, loopback, CGNAT, metadata, multicast, and reserved hosts so
// the catalogue-gated proxy cannot be used as an SSRF vector.
export function isBlockedHost(hostname) {
  if (!hostname) return true;
  const h = String(hostname)
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');

  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (METADATA_HOSTS.has(h)) return true;

  const v4 = parseIPv4(h);
  if (v4) return isBlockedIPv4(v4);

  const v6 = parseIPv6(h);
  if (v6) return isBlockedIPv6(v6);

  // Fail closed on IP-shaped strings we could not parse (odd encodings, junk).
  if (looksLikeIpLiteral(h)) return true;
  return false;
}

export function isBlockedIp(address) {
  const ip = String(address || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (!ip) return true;
  return isBlockedHost(ip);
}

export function isBlockedTarget(url) {
  return !/^https?:$/.test(url.protocol) || isBlockedHost(url.hostname);
}

export async function assertSafeUrl(url, { lookupFn = dnsLookup } = {}) {
  if (isBlockedTarget(url)) {
    throw Object.assign(new Error('blocked_target'), { code: 'BLOCKED' });
  }
  const host = String(url.hostname || '').replace(/^\[|\]$/g, '');
  let records;
  try {
    if (net.isIP(host)) {
      records = [{ address: host }];
    } else {
      records = await lookupFn(host, { all: true });
    }
  } catch (err) {
    throw Object.assign(new Error('blocked_target'), { code: 'BLOCKED', cause: err });
  }
  if (!records?.length) {
    throw Object.assign(new Error('blocked_target'), { code: 'BLOCKED' });
  }
  for (const { address } of records) {
    if (isBlockedIp(address) || isBlockedHost(address)) {
      throw Object.assign(new Error('blocked_target'), { code: 'BLOCKED' });
    }
  }
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

export async function fetchFollow(url, headers, signal, hops = 0, deps = {}) {
  const { fetchImpl = fetch, lookupFn = dnsLookup } = deps;
  if (hops > MAX_REDIRECTS) {
    throw Object.assign(new Error('too_many_redirects'), { code: 'REDIRECTS' });
  }
  await assertSafeUrl(url, { lookupFn });

  const upstream = await fetchImpl(url.href, { headers, signal, redirect: 'manual' });
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location');
    if (!location) return { response: upstream, finalUrl: url.href };
    let next;
    try {
      next = new URL(location, url);
    } catch {
      throw Object.assign(new Error('bad_redirect'), { code: 'BLOCKED' });
    }
    return fetchFollow(next, headers, signal, hops + 1, deps);
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
