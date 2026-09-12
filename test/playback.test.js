import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RECOVERY,
  createHlsConfig,
  createRecoveryState,
  decideRecovery,
  recoveryDelayMs,
  shouldCatchUp,
} from '../public/playback.js';

const types = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
const details = { BUFFER_STALLED_ERROR: 'bufferStalledError' };

function decide(state, error) {
  return decideRecovery(state, { ...error, ErrorTypes: types, ErrorDetails: details });
}

test('live HLS config disables low-latency mode', () => {
  const cfg = createHlsConfig({ live: true });
  assert.equal(cfg.lowLatencyMode, false);
  assert.ok(cfg.maxBufferLength <= 20);
  assert.ok(cfg.liveSyncDurationCount >= 3);
  assert.equal(cfg.capLevelToPlayerSize, true);
});

test('non-fatal buffer stall nudges the live edge', () => {
  const { action, state } = decide(createRecoveryState(), {
    fatal: false,
    details: 'bufferStalledError',
  });
  assert.equal(action, RECOVERY.NUDGE_LIVE);
  assert.equal(state.network, 0);
});

test('network errors startLoad then fall back to the proxy', () => {
  let state = createRecoveryState();
  for (let i = 0; i < 3; i++) {
    const out = decide(state, { fatal: true, type: 'networkError' });
    assert.equal(out.action, RECOVERY.START_LOAD);
    state = out.state;
  }
  const fallback = decide(state, { fatal: true, type: 'networkError' });
  assert.equal(fallback.action, RECOVERY.FALLBACK_PROXY);
  assert.equal(fallback.state.usedFallback, true);
});

test('media errors recover, then swap audio, then restart after fallback', () => {
  let state = createRecoveryState();
  let out = decide(state, { fatal: true, type: 'mediaError' });
  assert.equal(out.action, RECOVERY.RECOVER_MEDIA);
  out = decide(out.state, { fatal: true, type: 'mediaError' });
  assert.equal(out.action, RECOVERY.SWAP_AUDIO);
  out = decide(out.state, { fatal: true, type: 'mediaError' });
  assert.equal(out.action, RECOVERY.RECOVER_MEDIA);
  out = decide(out.state, { fatal: true, type: 'mediaError' });
  assert.equal(out.action, RECOVERY.FALLBACK_PROXY);
  out = decide(out.state, { fatal: true, type: 'mediaError' });
  assert.equal(out.action, RECOVERY.RECOVER_MEDIA);
});

test('unknown fatal errors give up after fallback and restarts', () => {
  let state = createRecoveryState();
  let out = decide(state, { fatal: true, type: 'otherError' });
  assert.equal(out.action, RECOVERY.FALLBACK_PROXY);
  out = decide(out.state, { fatal: true, type: 'otherError' });
  assert.equal(out.action, RECOVERY.RESTART);
  out = decide(out.state, { fatal: true, type: 'otherError' });
  assert.equal(out.action, RECOVERY.RESTART);
  out = decide(out.state, { fatal: true, type: 'otherError' });
  assert.equal(out.action, RECOVERY.GIVE_UP);
});

test('live catch-up triggers only when drift exceeds the threshold', () => {
  assert.equal(shouldCatchUp(10, 15, 12), false);
  assert.equal(shouldCatchUp(10, 25, 12), true);
  assert.equal(shouldCatchUp(Number.NaN, 25, 12), false);
});

test('recovery delays grow with attempts', () => {
  assert.ok(recoveryDelayMs(RECOVERY.START_LOAD, { network: 3 }) > recoveryDelayMs(RECOVERY.START_LOAD, { network: 1 }));
  assert.ok(recoveryDelayMs(RECOVERY.RESTART, { restarts: 2 }) > recoveryDelayMs(RECOVERY.RESTART, { restarts: 0 }));
});
