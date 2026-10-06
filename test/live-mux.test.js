import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
import { pickUpstream, liveMuxStatus, installMuxChildForTest, createFakeMuxChild, LIVE_DIR } from '../live-mux.js';

test('pickUpstream returns the first HTTP 200 candidate', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return { ok: url.includes('good') };
  };
  const picked = await pickUpstream(
    ['https://bad.example/a.m3u8', 'https://good.example/a.m3u8', 'https://later.example/a.m3u8'],
    fakeFetch
  );
  assert.equal(picked, 'https://good.example/a.m3u8');
  assert.deepEqual(calls, ['https://bad.example/a.m3u8', 'https://good.example/a.m3u8']);
});

test('pickUpstream skips non-http and exhausted lists', async () => {
  assert.equal(await pickUpstream(['/live/index.m3u8'], async () => ({ ok: true })), null);
  assert.equal(await pickUpstream(['https://down.example/a.m3u8'], async () => ({ ok: false })), null);
});

test('live mux is idle under the test runner', () => {
  const status = liveMuxStatus();
  assert.equal(status.running, false);
  assert.match(LIVE_DIR, /tv-lv-live-/);
});

test('missing ffmpeg is reported instead of crashing the process', () => {
  const child = createFakeMuxChild();
  installMuxChildForTest(child, { args: [], label: 'synthetic' });
  assert.doesNotThrow(() => {
    child.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));
  });
  const status = liveMuxStatus();
  assert.equal(status.running, false);
  assert.equal(status.ready, false);
  assert.equal(status.error, 'ffmpeg_missing');
  assert.equal(status.source, null);
});
