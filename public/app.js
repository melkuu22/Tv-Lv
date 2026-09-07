const video = document.getElementById('video');
const overlay = document.getElementById('video-overlay');
const overlayText = document.getElementById('overlay-text');
const listEl = document.getElementById('channel-list');
const emptyEl = document.getElementById('empty-state');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const searchEl = document.getElementById('search');
const filtersEl = document.getElementById('filters');
const unmuteBtn = document.getElementById('unmute-btn');

const npLogo = document.getElementById('np-logo');
const npName = document.getElementById('np-name');
const npTagline = document.getElementById('np-tagline');
const npBadge = document.getElementById('np-badge');
const npFav = document.getElementById('np-fav');

const LS_FAV = 'tvlv:favorites';
const LS_LAST = 'tvlv:last';

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

function setOverlay(text, { error = false, hidden = false } = {}) {
  overlayText.textContent = text;
  overlay.classList.toggle('hidden', hidden);
  overlay.classList.toggle('error', error);
}

function setStatus(state, text) {
  statusEl.className = `status ${state}`;
  statusText.textContent = text;
}

function channelById(id) {
  return allChannels.find((c) => c.id === id);
}

function visibleChannels() {
  const q = searchText.trim().toLowerCase();
  return allChannels.filter((c) => {
    if (activeFilter === 'fav' && !favorites.has(c.id)) return false;
    if (['LV', 'RU', 'UA', 'EN'].includes(activeFilter) && c.country !== activeFilter) {
      return false;
    }
    if (q && !(`${c.name} ${c.category}`.toLowerCase().includes(q))) return false;
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

function renderChannels() {
  const list = visibleChannels();
  listEl.innerHTML = '';
  emptyEl.hidden = list.length > 0;

  for (const channel of list) {
    const flag = flags[channel.country] || '';
    const badge =
      channel.available === false
        ? '<span class="off-dot" title="Nav pieejams"></span>'
        : channel.live
          ? '<span class="live-dot" title="Tiešraide"></span>'
          : '';
    const isFav = favorites.has(channel.id);

    const li = document.createElement('li');
    li.className = `channel-item${channel.id === activeId ? ' active' : ''}`;
    li.dataset.id = channel.id;
    li.innerHTML = `
      <div class="channel-logo" style="background:${channel.color}">${channel.logo}</div>
      <div class="channel-info">
        <div class="channel-name">${flag ? `<span class="flag">${flag}</span>` : ''}${channel.name}</div>
        <div class="channel-cat">${channel.category}</div>
      </div>
      ${badge}
      <button class="fav-star${isFav ? ' on' : ''}" title="Izlase" aria-label="Izlase">${isFav ? '★' : '☆'}</button>
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

function playChannel(channel) {
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
  npBadge.hidden = !channel.live;
  updateFavButton();

  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.removeAttribute('src');
  video.load();
  showUnmute(false);

  const src = channel.playUrl;
  if (!src) {
    setOverlay(`${channel.name}: ${channel.tagline}`, { error: true });
    return;
  }

  setOverlay(`Ielādē ${channel.name}…`);

  // Browsers only allow autoplay for muted media, so start muted and offer an
  // explicit unmute affordance once playback begins.
  video.muted = true;

  const onPlaying = () => {
    setOverlay('', { hidden: true });
    showUnmute(video.muted);
  };

  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      // Try to auto-recover transient live-stream errors before giving up.
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        setOverlay(`Atjauno savienojumu ar ${channel.name}…`);
        hls.startLoad();
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        hls.destroy();
        hls = null;
        setOverlay(`Neizdevās ielādēt ${channel.name}. Mēģiniet citu kanālu.`, {
          error: true,
        });
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src; // Native HLS (Safari).
    video.play().catch(() => {});
  } else {
    setOverlay('Jūsu pārlūks neatbalsta HLS straumējumu.', { error: true });
    return;
  }

  video.removeEventListener('playing', onPlaying);
  video.addEventListener('playing', onPlaying, { once: true });
}

function unmute() {
  video.muted = false;
  if (video.paused) video.play().catch(() => {});
  showUnmute(false);
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
    }
  });
}

async function init() {
  unmuteBtn.addEventListener('click', unmute);
  npFav.addEventListener('click', () => activeId && toggleFavorite(activeId));
  searchEl.addEventListener('input', () => {
    searchText = searchEl.value;
    renderChannels();
  });
  video.addEventListener('volumechange', () => showUnmute(video.muted && !video.paused));
  setupKeyboard();

  try {
    const health = await fetch('/api/health').then((r) => r.json());
    setStatus('ok', `Tiešsaistē · ${health.channels} kanāli`);
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
      allChannels.find((c) => c.available !== false) ||
      allChannels[0];
    if (first) playChannel(first);
  } catch {
    setOverlay('Neizdevās ielādēt kanālu sarakstu.', { error: true });
    setStatus('error', 'Kļūda ielādējot kanālus');
  }
}

init();
