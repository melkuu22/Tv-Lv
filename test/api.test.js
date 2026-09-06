import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import app from '../server.js';
import { channels } from '../data/channels.js';

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

test('GET /api/channels returns the catalogue', async () => {
  const res = await fetch(`${baseUrl}/api/channels`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, channels.length);
  assert.ok(Array.isArray(body.channels));
  for (const channel of body.channels) {
    assert.ok(channel.id);
    assert.ok(channel.name);
    assert.match(channel.stream, /^https?:\/\/.+\.m3u8/);
  }
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
