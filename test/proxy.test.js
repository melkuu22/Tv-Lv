import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBlockedHost, isBlockedTarget, rewritePlaylist } from '../proxy.js';
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

test('catalogue helpers: demo is playable but not initially proxied', () => {
  const demo = { id: 'demo', stream: 'https://example.com/a.m3u8' };
  const liveHttp = { id: 'x', stream: 'http://cdn.example/a.m3u8', live: true };
  const flagged = { id: 'y', stream: 'https://cdn.example/a.m3u8', proxy: true };
  const off = { id: 'z', stream: null, available: false };

  assert.equal(isPlayable(demo), true);
  assert.equal(shouldProxy(demo), false);
  assert.equal(isProxyable(demo), true);
  assert.equal(shouldProxy(liveHttp), true);
  assert.equal(shouldProxy(flagged), true);
  assert.equal(isPlayable(off), false);
  assert.equal(shouldProxy(off), false);
});
