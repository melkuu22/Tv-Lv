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
