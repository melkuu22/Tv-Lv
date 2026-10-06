import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBlockedHost, isBlockedIp, isBlockedTarget, rewritePlaylist, fetchFollow, assertSafeUrl } from '../proxy.js';
import { isPlayable, isProxyable, shouldProxy } from '../data/channels.js';

test('rewritePlaylist rewrites segment and key URIs through the proxy', () => {
  const src = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"',
    'seg0.ts',
    'https://cdn.example/live/seg1.ts',
  ].join('\n');
  const out = rewritePlaylist(src, 'https://cdn.example/live/pl.m3u8', 'tnt');
  assert.match(out, /URI="\/proxy\/tnt\?u=/);
  assert.match(out, /\/proxy\/tnt\?u=/);
  assert.ok(out.includes(encodeURIComponent('https://cdn.example/live/seg0.ts')));
  assert.ok(out.includes(encodeURIComponent('https://cdn.example/live/keys/key.bin')));
});

test('isBlockedHost covers loopback, RFC1918, link-local and IPv6 ULA', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.4',
    '172.16.1.1',
    '169.254.169.254',
    '::1',
    '[::1]',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '[::ffff:7f00:1]',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
  ]) {
    assert.equal(isBlockedHost(host), true, host);
  }
  assert.equal(isBlockedHost('cdn.example.com'), false);
  assert.equal(isBlockedHost('8.8.8.8'), false);
});

test('isBlockedTarget rejects non-http schemes', () => {
  assert.equal(isBlockedTarget(new URL('https://cdn.example.com/a.m3u8')), false);
  assert.equal(isBlockedTarget(new URL('file:///etc/passwd')), true);
});

test('assertSafeUrl blocks hostnames that resolve to loopback', async () => {
  await assert.rejects(
    () =>
      assertSafeUrl(new URL('https://localtest.me/x.m3u8'), {
        lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
      }),
    (err) => err.code === 'BLOCKED'
  );
  await assert.rejects(
    () =>
      assertSafeUrl(new URL('https://evil.example/x.m3u8'), {
        lookupFn: async () => [
          { address: '1.1.1.1', family: 4 },
          { address: '169.254.169.254', family: 4 },
        ],
      }),
    (err) => err.code === 'BLOCKED'
  );
  await assertSafeUrl(new URL('https://cdn.example.com/a.m3u8'), {
    lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
  });
});

test('fetchFollow blocks private/loopback redirect hops', async () => {
  const calls = [];
  const fetchImpl = async (href) => {
    calls.push(href);
    if (href.startsWith('https://cdn.example/start')) {
      return {
        status: 302,
        headers: { get: (n) => (n === 'location' ? 'http://127.0.0.1/secret.m3u8' : null) },
      };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  const lookupFn = async (host) => {
    if (host === 'cdn.example') return [{ address: '93.184.216.34', family: 4 }];
    return [{ address: '127.0.0.1', family: 4 }];
  };
  await assert.rejects(
    () =>
      fetchFollow(new URL('https://cdn.example/start.m3u8'), {}, undefined, 0, {
        fetchImpl,
        lookupFn,
      }),
    (err) => err.code === 'BLOCKED'
  );
  assert.deepEqual(calls, ['https://cdn.example/start.m3u8']);
});

test('fetchFollow returns {response, finalUrl} when a 3xx has no Location', async () => {
  const fetchImpl = async () => ({
    status: 302,
    headers: { get: () => null },
  });
  const lookupFn = async () => [{ address: '8.8.8.8', family: 4 }];
  const out = await fetchFollow(new URL('https://cdn.example/gone.m3u8'), {}, undefined, 0, {
    fetchImpl,
    lookupFn,
  });
  assert.equal(out.response.status, 302);
  assert.equal(out.finalUrl, 'https://cdn.example/gone.m3u8');
});

test('isBlockedIp treats multicast and unspecified v4 as blocked', () => {
  assert.equal(isBlockedIp('0.0.0.0'), true);
  assert.equal(isBlockedIp('224.0.0.1'), true);
  assert.equal(isBlockedIp('8.8.8.8'), false);
});

test('catalogue helpers: remotes are proxied, local mux is not', () => {
  const demo = { id: 'demo', stream: 'https://example.com/a.m3u8' };
  const liveHttp = { id: 'x', stream: 'http://cdn.example/a.m3u8', live: true };
  const flagged = { id: 'y', stream: 'https://cdn.example/a.m3u8', proxy: true };
  const local = { id: 'house-live', stream: '/live/index.m3u8', local: true, live: true };
  const off = { id: 'z', stream: null, available: false };

  assert.equal(isPlayable(demo), true);
  assert.equal(shouldProxy(demo), true);
  assert.equal(isProxyable(demo), true);
  assert.equal(shouldProxy(liveHttp), true);
  assert.equal(shouldProxy(flagged), true);
  assert.equal(shouldProxy(local), false);
  assert.equal(isProxyable(local), false);
  assert.equal(isPlayable(off), false);
  assert.equal(shouldProxy(off), false);
});
