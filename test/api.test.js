import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Set the test environment before importing the app so HTTP request logging is
// disabled during tests (keeps the test output clean). Dynamic import ensures
// the env var is set before the module is evaluated, cross-platform.
process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');
const { channels } = await import('../data/channels.js');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

test('GET /api/health reports ok', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.channels, channels.length);
});

test('responses include security headers', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('GET /api/channels exposes country flags', async () => {
  const res = await fetch(`${baseUrl}/api/channels`);
  const body = await res.json();
  assert.ok(body.countryFlags);
  assert.equal(typeof body.countryFlags.LV, 'string');
  assert.equal(typeof body.countryFlags.RU, 'string');
});

test('GET /api/channels returns the catalogue', async () => {
  const res = await fetch(`${baseUrl}/api/channels`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, channels.length);
  assert.ok(Array.isArray(body.channels));
  for (const channel of body.channels) {
    assert.ok(channel.id);
    assert.ok(channel.name);
    if (channel.available === false) {
      assert.equal(channel.playUrl, null);
    } else {
      assert.match(channel.stream, /^https?:\/\/.+\.m3u8/);
      assert.ok(channel.playUrl, `expected playUrl for ${channel.id}`);
    }
  }
});

test('proxied channels expose a same-origin playUrl', async () => {
  const res = await fetch(`${baseUrl}/api/channels`);
  const body = await res.json();
  for (const channel of body.channels) {
    if (channel.proxy && channel.available !== false) {
      assert.equal(channel.playUrl, `/proxy/${channel.id}`);
    }
  }
});

test('proxy rejects unknown / non-proxyable channels', async () => {
  const unknown = await fetch(`${baseUrl}/proxy/does-not-exist`);
  assert.equal(unknown.status, 404);
  // `demo` is a real channel but not flagged proxy:true.
  const notProxyable = await fetch(`${baseUrl}/proxy/demo`);
  assert.equal(notProxyable.status, 404);
});

test('GET /api/channels/:id returns a single channel', async () => {
  const res = await fetch(`${baseUrl}/api/channels/demo`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, 'demo');
});

test('GET /api/channels/:id 404s for unknown channel', async () => {
  const res = await fetch(`${baseUrl}/api/channels/does-not-exist`);
  assert.equal(res.status, 404);
});

test('Demo Kanāls is always playable without the proxy', async () => {
  const res = await fetch(`${baseUrl}/api/channels/demo`);
  const body = await res.json();
  assert.equal(body.available, undefined);
  assert.equal(body.proxy, undefined);
  assert.match(body.stream, /^https:\/\/test-streams\.mux\.dev\/.+\.m3u8/);
  assert.equal(body.playUrl, body.stream);
});

test('unavailable channels have a null playUrl', async () => {
  const res = await fetch(`${baseUrl}/api/channels/dom2`);
  const body = await res.json();
  assert.equal(body.available, false);
  assert.equal(body.playUrl, null);
});

test('proxy sets CORS on every response', async () => {
  const unknown = await fetch(`${baseUrl}/proxy/does-not-exist`);
  assert.equal(unknown.headers.get('access-control-allow-origin'), '*');
  const blocked = await fetch(`${baseUrl}/proxy/tnt?u=${encodeURIComponent('http://127.0.0.1/secret.m3u8')}`);
  assert.equal(blocked.headers.get('access-control-allow-origin'), '*');
});

test('proxy SSRF guard blocks private and non-http targets', async () => {
  const cases = [
    'http://127.0.0.1/secret.m3u8',
    'http://localhost/secret.m3u8',
    'http://10.0.0.8/secret.m3u8',
    'http://192.168.1.1/secret.m3u8',
    'http://172.16.0.1/secret.m3u8',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/secret.m3u8',
    'file:///etc/passwd',
    'ftp://example.com/x.m3u8',
  ];
  for (const target of cases) {
    const res = await fetch(`${baseUrl}/proxy/tnt?u=${encodeURIComponent(target)}`);
    assert.equal(res.status, 400, `expected blocked_target for ${target}`);
    const body = await res.json();
    assert.equal(body.error, 'blocked_target');
  }
});

test('proxy accepts a public https target URL for a proxyable channel', async () => {
  const res = await fetch(
    `${baseUrl}/proxy/tnt?u=${encodeURIComponent('https://example.com/playlist.m3u8')}`
  );
  // Must not be the SSRF 400 — either upstream fetch works or fails as 502/non-400.
  assert.notEqual(res.status, 400);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});
