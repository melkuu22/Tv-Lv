import {
  RECOVERY,
  createHlsConfig,
  createRecoveryState,
  decideRecovery,
  recoveryDelayMs,
  shouldCatchUp,
} from './playback.js';

const video = document.getElementById('video');
const overlay = document.getElementById('video-overlay');
const overlayText = document.getElementById('overlay-text');
const overlayDemo = document.getElementById('overlay-demo');
const overlayRetry = document.getElementById('overlay-retry');
const listEl = document.getElementById('channel-list');
const emptyEl = document.getElementById('empty-state');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const searchEl = document.getElementById('search');
const filtersEl = document.getElementById('filters');
const unmuteBtn = document.getElementById('unmute-btn');
const videoWrap = document.querySelector('.video-wrap');

const npLogo = document.getElementById('np-logo');
const npName = document.getElementById('np-name');
const npTagline = document.getElementById('np-tagline');
const npBadge = document.getElementById('np-badge');
const npFav = document.getElementById('np-fav');

const LS_FAV = 'tvlv:favorites';
const LS_LAST = 'tvlv:last';
const WATCHDOG_MS = 2000;
const STALL_TICKS = 3;

const FILTERS = [
  { key: 'all', label: 'Visi' },
  { key: 'fav', label: '★ Izlase' },
  { key: 'LV', label: '🇱🇻 LV' },
  { key: 'RU', label: '🇷🇺 RU' },
  { key: 'UA', label: '🇺🇦 UA' },
  { key: 'EN', label: '🇬🇧 EN' },
];

let allChannels = [];
let flags = {};
let favorites = loadFavorites();
let activeFilter = 'all';
let searchText = '';
let hls = null;
let activeId = null;
let playGeneration = 0;
let recoveryState = createRecoveryState();
let currentSrc = null;
let fallbackSrc = null;
let activeChannel = null;
let watchdogTimer = null;
let lastMediaTime = 0;
let stallTicks = 0;
let recovering = false;
let lastOnlineStatus = 'ok';

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_FAV) || '[]'));
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(LS_FAV, JSON.stringify([...favorites]));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setOverlay(text, { error = false, hidden = false, demo = false, retry = false } = {}) {
  overlayText.textContent = text;
  overlay.classList.toggle('hidden', hidden);
  overlay.classList.toggle('error', error);
  if (overlayDemo) overlayDemo.hidden = !demo;
  if (overlayRetry) overlayRetry.hidden = !retry;
}

function setStatus(state, text) {
  lastOnlineStatus = state;
  statusEl.className = `status ${state}`;
  statusText.textContent = text;
}

function channelById(id) {
  return allChannels.find((c) => c.id === id);
}

function proxyUrlFor(channel) {
  return `/proxy/${encodeURIComponent(channel.id)}`;
}

function visibleChannels() {
  const q = searchText.trim().toLowerCase();
  return allChannels.filter((c) => {
    if (activeFilter === 'fav' && !favorites.has(c.id)) return false;
    if (['LV', 'RU', 'UA', 'EN'].includes(activeFilter) && c.country !== activeFilter) {
      return false;
    }
    if (
      q &&
      !`${c.name} ${c.category} ${c.tagline || ''} ${c.language || ''}`
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }
    return true;
  });
}

function renderFilters() {
  filtersEl.innerHTML = '';
  for (const f of FILTERS) {
    const count =
      f.key === 'all'
        ? allChannels.length
        : f.key === 'fav'
          ? favorites.size
          : allChannels.filter((c) => c.country === f.key).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter${activeFilter === f.key ? ' active' : ''}`;
    btn.textContent = `${f.label} ${count}`;
    btn.addEventListener('click', () => {
      activeFilter = f.key;
      renderFilters();
      renderChannels();
    });
    filtersEl.appendChild(btn);
  }
}

function emptyMessage() {
  if (activeFilter === 'fav' && favorites.size === 0) {
    return 'Izlase ir tukša. Pieskarieties ★ pie kanāla, lai pievienotu.';
  }
  if (searchText.trim()) {
    return 'Nekas nav atrasts. Nomainiet meklēšanu vai filtru.';
  }
  return 'Nav atrastu kanālu.';
}

function renderChannels() {
  const list = visibleChannels();
  listEl.innerHTML = '';
  emptyEl.hidden = list.length > 0;
  emptyEl.textContent = emptyMessage();

  for (const channel of list) {
    const flag = flags[channel.country] || '';
    const unavailable = channel.available === false;
    const badge = unavailable
      ? '<span class="off-badge">Nav pieejams</span>'
      : channel.live
        ? '<span class="live-dot" title="Tiešraide"></span>'
        : '';
    const isFav = favorites.has(channel.id);

    const li = document.createElement('li');
    li.className = `channel-item${channel.id === activeId ? ' active' : ''}${
      unavailable ? ' unavailable' : ''
    }`;
    li.dataset.id = channel.id;
    li.innerHTML = `
      <div class="channel-logo" style="background:${escapeHtml(channel.color)}">${channel.logo}</div>
      <div class="channel-info">
        <div class="channel-name">${flag ? `<span class="flag">${flag}</span>` : ''}${escapeHtml(channel.name)}</div>
        <div class="channel-cat">${escapeHtml(channel.category)}${unavailable ? ' · nav tiešraides' : ''}</div>
      </div>
      ${badge}
      <button class="fav-star${isFav ? ' on' : ''}" type="button" title="Izlase" aria-label="Izlase">${isFav ? '★' : '☆'}</button>
    `;
    li.addEventListener('click', () => playChannel(channel));
    li.querySelector('.fav-star').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(channel.id);
    });
    listEl.appendChild(li);
  }
}

function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  renderFilters();
  renderChannels();
  if (id === activeId) updateFavButton();
}

function updateFavButton() {
  const channel = channelById(activeId);
  if (!channel) {
    npFav.hidden = true;
    return;
  }
  const isFav = favorites.has(channel.id);
  npFav.hidden = false;
  npFav.textContent = isFav ? '★' : '☆';
  npFav.classList.toggle('on', isFav);
  npFav.title = isFav ? 'Noņemt no izlases' : 'Pievienot izlasei';
}

function markActive(id) {
  activeId = id;
  for (const item of listEl.querySelectorAll('.channel-item')) {
    item.classList.toggle('active', item.dataset.id === id);
  }
}

function showUnmute(show) {
  unmuteBtn.hidden = !show;
}

function clearWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  stallTicks = 0;
}

function stopHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function stopPlayback() {
  recovering = false;
  clearWatchdog();
  unbindVideoEvents();
  stopHls();
  video.removeAttribute('src');
  video.load();
  showUnmute(false);
}

async function tryStartPlayback() {
  // TV / desktop browsers sometimes allow unmuted autoplay; otherwise start
  // muted and show one big unmute control so watching stays one tap.
  video.muted = false;
  try {
    await video.play();
    showUnmute(false);
  } catch {
    video.muted = true;
    try {
      await video.play();
      showUnmute(true);
    } catch {
      showUnmute(true);
    }
  }
}

function onPlaying() {
  recovering = false;
  stallTicks = 0;
  lastMediaTime = video.currentTime;
  setOverlay('', { hidden: true });
  showUnmute(video.muted);
  if (lastOnlineStatus !== 'error') setStatus('ok', 'Tiešsaistē');
}

function onWaiting() {
  if (!activeChannel || video.paused) return;
  setOverlay(`Buferē ${activeChannel.name}…`);
}

function onStalled() {
  if (!activeChannel) return;
  applyRecovery({ fatal: false, details: 'bufferStalledError' });
}

function onNativeError() {
  if (!activeChannel || hls) return;
  applyRecovery({ fatal: true, type: 'networkError' });
}

function bindVideoEvents() {
  video.addEventListener('playing', onPlaying);
  video.addEventListener('waiting', onWaiting);
  video.addEventListener('stalled', onStalled);
  video.addEventListener('error', onNativeError);
}

function unbindVideoEvents() {
  video.removeEventListener('playing', onPlaying);
  video.removeEventListener('waiting', onWaiting);
  video.removeEventListener('stalled', onStalled);
  video.removeEventListener('error', onNativeError);
}

function nudgeLiveEdge() {
  const liveSync = hls?.liveSyncPosition;
  if (shouldCatchUp(video.currentTime, liveSync, 8)) {
    video.currentTime = liveSync;
  }
}

function startWatchdog(generation) {
  clearWatchdog();
  lastMediaTime = video.currentTime;
  watchdogTimer = setInterval(() => {
    if (generation !== playGeneration || !activeChannel) return;
    if (video.paused && !recovering) return;

    const t = video.currentTime;
    if (!video.paused && video.readyState >= 2 && t === lastMediaTime) {
      stallTicks += 1;
      if (stallTicks === STALL_TICKS) {
        applyRecovery({ fatal: false, details: 'bufferStalledError' });
      } else if (stallTicks >= STALL_TICKS * 2) {
        stallTicks = 0;
        applyRecovery({ fatal: true, type: 'mediaError' });
      }
    } else {
      stallTicks = 0;
      lastMediaTime = t;
    }

    if (activeChannel.live) nudgeLiveEdge();
  }, WATCHDOG_MS);
}

function attachHls(src, generation, channel) {
  stopHls();
  hls = new window.Hls(createHlsConfig({ live: Boolean(channel.live) }));
  hls.loadSource(src);
  hls.attachMedia(video);
  hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
    if (generation !== playGeneration) return;
    tryStartPlayback();
  });
  hls.on(window.Hls.Events.ERROR, (_event, data) => {
    if (generation !== playGeneration) return;
    applyRecovery({
      fatal: data.fatal,
      type: data.type,
      details: data.details,
      ErrorTypes: window.Hls.ErrorTypes,
      ErrorDetails: window.Hls.ErrorDetails,
    });
  });
}

function fail(message) {
  recovering = false;
  stopPlayback();
  setStatus('error', 'Straume pārtrūka');
  setOverlay(message, { error: true, demo: true, retry: true });
}

async function applyRecovery(error) {
  if (!activeChannel || recovering) return;
  const generation = playGeneration;
  const decided = decideRecovery(recoveryState, error);
  recoveryState = decided.state;
  const action = decided.action;
  if (!action) return;

  if (action === RECOVERY.NUDGE_LIVE) {
    nudgeLiveEdge();
    if (hls) hls.startLoad();
    return;
  }

  recovering = true;
  const wait = recoveryDelayMs(action, recoveryState);

  if (action === RECOVERY.GIVE_UP) {
    fail(`${activeChannel.name} šobrīd nespēlē. Mēģiniet vēlreiz vai izvēlieties citu kanālu.`);
    return;
  }

  setOverlay(`Atjauno savienojumu ar ${activeChannel.name}…`);
  setStatus('warn', 'Atjauno…');
  if (wait) {
    await new Promise((r) => setTimeout(r, wait));
    if (generation !== playGeneration) return;
  }

  if (action === RECOVERY.START_LOAD) {
    if (hls) hls.startLoad();
    else reloadNative(currentSrc);
    recovering = false;
    return;
  }

  if (action === RECOVERY.RECOVER_MEDIA) {
    if (hls) hls.recoverMediaError();
    else reloadNative(currentSrc);
    recovering = false;
    return;
  }

  if (action === RECOVERY.SWAP_AUDIO) {
    if (hls) {
      hls.swapAudioCodec();
      hls.recoverMediaError();
    } else {
      reloadNative(currentSrc);
    }
    recovering = false;
    return;
  }

  if (action === RECOVERY.FALLBACK_PROXY && fallbackSrc && fallbackSrc !== currentSrc) {
    currentSrc = fallbackSrc;
    startSource(currentSrc, generation, activeChannel);
    return;
  }

  if (action === RECOVERY.FALLBACK_PROXY || action === RECOVERY.RESTART) {
    startSource(currentSrc, generation, activeChannel);
    return;
  }

  recovering = false;
}

function reloadNative(src) {
  if (!src) return;
  const joiner = src.includes('?') ? '&' : '?';
  video.src = `${src}${joiner}_r=${Date.now()}`;
  tryStartPlayback();
}

function startSource(src, generation, channel) {
  recovering = false;
  unbindVideoEvents();
  bindVideoEvents();
  startWatchdog(generation);

  if (window.Hls && window.Hls.isSupported()) {
    attachHls(src, generation, channel);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    stopHls();
    video.src = src;
    tryStartPlayback();
  } else {
    fail('Jūsu pārlūks neatbalsta HLS straumējumu.');
  }
}

function playChannel(channel) {
  const generation = ++playGeneration;
  recoveryState = createRecoveryState();
  if (channel.playUrl && channel.playUrl.startsWith('/proxy/')) {
    recoveryState.usedFallback = true;
  }
  activeChannel = channel;
  markActive(channel.id);
  try {
    localStorage.setItem(LS_LAST, channel.id);
  } catch {
    /* ignore */
  }

  npLogo.textContent = channel.logo;
  npLogo.style.background = channel.color;
  npName.textContent = channel.name;
  npTagline.textContent = channel.tagline;
  npBadge.hidden = !channel.live || channel.available === false;
  npBadge.textContent = channel.available === false ? 'NAV PIEEJAMS' : '● TIEŠRAIDE';
  npBadge.classList.toggle('off', channel.available === false);
  updateFavButton();

  stopPlayback();

  const src = channel.playUrl;
  fallbackSrc = proxyUrlFor(channel);
  currentSrc = src;
  if (src === fallbackSrc) recoveryState.usedFallback = true;

  if (!src || channel.available === false) {
    setOverlay(`${channel.name}: ${channel.tagline}`, { error: true, demo: true });
    return;
  }

  setOverlay(`Ielādē ${channel.name}…`);
  startSource(src, generation, channel);
}

function resumeSession({ force = false } = {}) {
  if (!activeChannel || !currentSrc || activeChannel.available === false) return;
  const playing = !video.paused && video.readyState >= 2;
  if (playing && !force) {
    if (hls) hls.startLoad();
    return;
  }
  setOverlay(`Atjauno savienojumu ar ${activeChannel.name}…`);
  setStatus('warn', 'Atjauno…');
  if (hls) {
    hls.startLoad();
    tryStartPlayback();
    return;
  }
  reloadNative(currentSrc);
}

function unmute() {
  video.muted = false;
  if (video.paused) video.play().catch(() => {});
  showUnmute(false);
}

function retryActive() {
  const channel = activeChannel || channelById(activeId);
  if (channel) playChannel(channel);
}

function playDemo() {
  const demo = channelById('demo') || allChannels.find((c) => c.available !== false);
  if (demo) playChannel(demo);
}

function moveSelection(delta) {
  const list = visibleChannels().filter((c) => c.available !== false);
  if (list.length === 0) return;
  const idx = list.findIndex((c) => c.id === activeId);
  const next = idx === -1 ? 0 : (idx + delta + list.length) % list.length;
  playChannel(list[next]);
  const el = listEl.querySelector(`.channel-item[data-id="${list[next].id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchEl) {
      e.preventDefault();
      searchEl.focus();
      return;
    }
    if (document.activeElement === searchEl) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key.toLowerCase() === 'm') {
      unmute();
    } else if (e.key === 'r' || e.key === 'R') {
      retryActive();
    }
  });
}

function setupSessionGuards() {
  window.addEventListener('online', () => resumeSession({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeSession();
  });
}

async function init() {
  unmuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    unmute();
  });
  videoWrap?.addEventListener('click', (e) => {
    if (e.target.closest('button, video')) return;
    if (video.muted && !video.paused) unmute();
  });
  overlayDemo?.addEventListener('click', (e) => {
    e.stopPropagation();
    playDemo();
  });
  overlayRetry?.addEventListener('click', (e) => {
    e.stopPropagation();
    retryActive();
  });
  npFav.addEventListener('click', () => activeId && toggleFavorite(activeId));
  searchEl.addEventListener('input', () => {
    searchText = searchEl.value;
    renderChannels();
  });
  video.addEventListener('volumechange', () => showUnmute(video.muted && !video.paused));
  setupKeyboard();
  setupSessionGuards();

  try {
    const health = await fetch('/api/health').then((r) => r.json());
    setStatus('ok', 'Tiešsaistē');
    statusEl.title = `${health.channels} kanāli`;
  } catch {
    setStatus('error', 'Serveris nav pieejams');
  }

  try {
    const data = await fetch('/api/channels').then((r) => r.json());
    flags = data.countryFlags || {};
    allChannels = data.channels;
    renderFilters();
    renderChannels();

    const lastId = (() => {
      try {
        return localStorage.getItem(LS_LAST);
      } catch {
        return null;
      }
    })();
    const last = lastId && channelById(lastId);
    const first =
      (last && last.available !== false && last) ||
      allChannels.find((c) => c.id === 'demo') ||
      allChannels.find((c) => c.available !== false) ||
      allChannels[0];
    if (first) playChannel(first);
  } catch {
    setOverlay('Neizdevās ielādēt kanālu sarakstu.', { error: true, retry: true });
    setStatus('error', 'Kļūda ielādējot kanālus');
  }
}

init();
