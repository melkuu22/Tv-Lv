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

test('isBlockedHost/isBlockedIp block CGNAT, metadata, reserved and multicast', () => {
  const blocked = [
    '100.64.0.0',
    '100.64.1.1',
    '100.100.100.200',
    '100.127.255.255',
    '169.254.169.254',
    '168.63.129.16',
    '0.0.0.0',
    '0.1.2.3',
    '192.0.0.8',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    'metadata.google.internal',
    'metadata.google',
    'metadata',
    'fd00:ec2::254',
    '[fd00:ec2::254]',
    '::ffff:100.64.1.1',
    '::ffff:6440:101',
    '[::ffff:6440:101]',
    '::ffff:6464:64c8',
    '[::ffff:6464:64c8]',
    '::ffff:0:100.64.1.1',
    '::ffff:0:6440:101',
    '64:ff9b::100.64.1.1',
    'ff02::1',
  ];
  for (const host of blocked) {
    assert.equal(isBlockedHost(host), true, host);
    assert.equal(isBlockedIp(host), true, host);
  }

  const allowed = [
    '8.8.8.8',
    '1.1.1.1',
    '100.63.255.255',
    '100.128.0.1',
    '192.0.1.1',
    '198.20.0.1',
    '223.255.255.255',
    'cdn.example.com',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
  ];
  for (const host of allowed) {
    assert.equal(isBlockedHost(host), false, host);
    assert.equal(isBlockedIp(host), false, host);
  }
});

test('isBlockedHost/isBlockedIp reject decimal, octal and hex IPv4 encodings', () => {
  const encodings = [
    '2130706433', // 127.0.0.1 decimal
    '0x7f000001', // 127.0.0.1 hex
    '0177.0.0.1', // 127.0.0.1 octal
    '127.1', // 127.0.0.1 short
    '1681916161', // 100.64.1.1 decimal
    '0x64400101', // 100.64.1.1 hex
    '0x64.0x40.0x1.0x1', // 100.64.1.1 dotted hex
    '0144.0100.01.01', // 100.64.1.1 octal
    '0x646464c8', // 100.100.100.200 hex
    '1684302024', // 100.100.100.200 decimal
  ];
  for (const host of encodings) {
    assert.equal(isBlockedHost(host), true, host);
    assert.equal(isBlockedIp(host), true, host);
  }
});

test('isBlockedTarget blocks CGNAT, metadata and encoded literals via URL', () => {
  const blocked = [
    'http://100.64.1.1/secret.m3u8',
    'http://100.100.100.200/latest/meta-data',
    'http://[::ffff:100.64.1.1]/secret.m3u8',
    'http://[::ffff:6440:101]/secret.m3u8',
    'http://[fd00:ec2::254]/latest/meta-data',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://0x64400101/secret.m3u8',
    'http://1681916161/secret.m3u8',
    'http://0144.0100.01.01/secret.m3u8',
    'http://0x64.0x40.0x1.0x1/secret.m3u8',
    'http://192.0.0.8/x',
    'http://198.18.0.1/x',
    'http://240.0.0.1/x',
    'http://0.1.2.3/x',
  ];
  for (const href of blocked) {
    assert.equal(isBlockedTarget(new URL(href)), true, href);
  }
  assert.equal(isBlockedTarget(new URL('https://cdn.example.com/a.m3u8')), false);
  assert.equal(isBlockedTarget(new URL('http://8.8.8.8/a.m3u8')), false);
});

test('isBlockedTarget rejects non-http schemes', () => {
  assert.equal(isBlockedTarget(new URL('https://cdn.example.com/a.m3u8')), false);
  assert.equal(isBlockedTarget(new URL('file:///etc/passwd')), true);
});

test('assertSafeUrl blocks hostnames that resolve to loopback, CGNAT or metadata', async () => {
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
  await assert.rejects(
    () =>
      assertSafeUrl(new URL('https://cgnat.example/x.m3u8'), {
        lookupFn: async () => [{ address: '100.64.1.1', family: 4 }],
      }),
    (err) => err.code === 'BLOCKED'
  );
  await assert.rejects(
    () =>
      assertSafeUrl(new URL('https://ali-meta.example/x.m3u8'), {
        lookupFn: async () => [{ address: '100.100.100.200', family: 4 }],
      }),
    (err) => err.code === 'BLOCKED'
  );
  await assert.rejects(
    () =>
      assertSafeUrl(new URL('https://aws6.example/x.m3u8'), {
        lookupFn: async () => [{ address: 'fd00:ec2::254', family: 6 }],
      }),
    (err) => err.code === 'BLOCKED'
  );
  await assert.rejects(
    () =>
      assertSafeUrl(new URL('https://mapped.example/x.m3u8'), {
        lookupFn: async () => [{ address: '::ffff:100.64.1.1', family: 6 }],
      }),
    (err) => err.code === 'BLOCKED'
  );
  await assert.rejects(
    () => assertSafeUrl(new URL('http://100.64.1.1/x.m3u8')),
    (err) => err.code === 'BLOCKED'
  );
  await assert.rejects(
    () => assertSafeUrl(new URL('http://metadata.google.internal/computeMetadata/v1/')),
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

test('fetchFollow blocks CGNAT and metadata on every redirect hop', async () => {
  const cases = [
    { location: 'http://100.64.1.1/secret.m3u8', resolved: '100.64.1.1' },
    { location: 'http://100.100.100.200/latest/meta-data', resolved: '100.100.100.200' },
    { location: 'http://[::ffff:100.64.1.1]/secret.m3u8', resolved: '::ffff:6440:101' },
    { location: 'http://cgnat.example/x.m3u8', resolved: '100.64.1.1' },
    { location: 'http://meta.example/x.m3u8', resolved: '100.100.100.200' },
    { location: 'http://0x64400101/secret.m3u8', resolved: '100.64.1.1' },
  ];
  for (const { location, resolved } of cases) {
    const calls = [];
    const fetchImpl = async (href) => {
      calls.push(href);
      if (href.startsWith('https://cdn.example/start')) {
        return {
          status: 302,
          headers: { get: (n) => (n === 'location' ? location : null) },
        };
      }
      throw new Error(`unexpected fetch ${href}`);
    };
    const lookupFn = async (host) => {
      if (host === 'cdn.example') return [{ address: '93.184.216.34', family: 4 }];
      return [{ address: resolved, family: resolved.includes(':') ? 6 : 4 }];
    };
    await assert.rejects(
      () =>
        fetchFollow(new URL('https://cdn.example/start.m3u8'), {}, undefined, 0, {
          fetchImpl,
          lookupFn,
        }),
      (err) => err.code === 'BLOCKED',
      location
    );
    assert.deepEqual(calls, ['https://cdn.example/start.m3u8'], location);
  }
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
