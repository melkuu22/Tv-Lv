export const RECOVERY = {
  START_LOAD: 'startLoad',
  RECOVER_MEDIA: 'recoverMedia',
  SWAP_AUDIO: 'swapAudio',
  RESTART: 'restart',
  GIVE_UP: 'giveUp',
  NUDGE_LIVE: 'nudgeLive',
  FALLBACK_PROXY: 'fallbackProxy',
};

export function createRecoveryState() {
  return {
    network: 0,
    media: 0,
    restarts: 0,
    swapped: false,
    usedFallback: false,
  };
}

export function createHlsConfig({ live = true } = {}) {
  // Regular broadcast HLS — lowLatencyMode causes stalls on non-LL streams.
  return {
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: live ? 18 : 30,
    maxMaxBufferLength: live ? 36 : 60,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 12,
    liveDurationInfinity: true,
    capLevelToPlayerSize: true,
    startLevel: -1,
    abrEwmaDefaultEstimate: 800000,
    manifestLoadingTimeOut: 15000,
    manifestLoadingMaxRetry: 4,
    manifestLoadingRetryDelay: 400,
    levelLoadingTimeOut: 15000,
    levelLoadingMaxRetry: 4,
    fragLoadingTimeOut: 20000,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 400,
  };
}

export function recoveryDelayMs(action, state) {
  if (action === RECOVERY.RESTART || action === RECOVERY.FALLBACK_PROXY) {
    return 400 + 350 * (state.restarts || 0);
  }
  if (action === RECOVERY.START_LOAD) return 200 * Math.max(1, state.network);
  if (action === RECOVERY.RECOVER_MEDIA || action === RECOVERY.SWAP_AUDIO) return 120;
  return 0;
}

export function shouldCatchUp(currentTime, liveSyncPosition, maxDrift = 12) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(liveSyncPosition)) return false;
  return liveSyncPosition - currentTime > maxDrift;
}

export function decideRecovery(state, { fatal, type, details, ErrorTypes, ErrorDetails } = {}) {
  const networkType = ErrorTypes?.NETWORK_ERROR ?? 'networkError';
  const mediaType = ErrorTypes?.MEDIA_ERROR ?? 'mediaError';
  const stalled = ErrorDetails?.BUFFER_STALLED_ERROR ?? 'bufferStalledError';

  if (!fatal) {
    if (details === stalled) return { action: RECOVERY.NUDGE_LIVE, state };
    return { action: null, state };
  }

  if (type === networkType) {
    if (state.network < 3) {
      const next = { ...state, network: state.network + 1 };
      return { action: RECOVERY.START_LOAD, state: next };
    }
    if (!state.usedFallback) {
      return { action: RECOVERY.FALLBACK_PROXY, state: { ...state, usedFallback: true, network: 0 } };
    }
    if (state.restarts < 2) {
      return {
        action: RECOVERY.RESTART,
        state: { ...state, restarts: state.restarts + 1, network: 0, media: 0 },
      };
    }
    return { action: RECOVERY.GIVE_UP, state };
  }

  if (type === mediaType) {
    if (state.media >= 1 && !state.swapped) {
      return { action: RECOVERY.SWAP_AUDIO, state: { ...state, swapped: true, media: state.media + 1 } };
    }
    if (state.media < 3) {
      return { action: RECOVERY.RECOVER_MEDIA, state: { ...state, media: state.media + 1 } };
    }
    if (!state.usedFallback) {
      return { action: RECOVERY.FALLBACK_PROXY, state: { ...state, usedFallback: true, media: 0 } };
    }
    if (state.restarts < 2) {
      return {
        action: RECOVERY.RESTART,
        state: { ...state, restarts: state.restarts + 1, network: 0, media: 0, swapped: false },
      };
    }
    return { action: RECOVERY.GIVE_UP, state };
  }

  if (!state.usedFallback) {
    return { action: RECOVERY.FALLBACK_PROXY, state: { ...state, usedFallback: true } };
  }
  if (state.restarts < 2) {
    return { action: RECOVERY.RESTART, state: { ...state, restarts: state.restarts + 1 } };
  }
  return { action: RECOVERY.GIVE_UP, state };
}
