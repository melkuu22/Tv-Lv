const video = document.getElementById('video');
const overlay = document.getElementById('video-overlay');
const overlayText = document.getElementById('overlay-text');
const listEl = document.getElementById('channel-list');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');

const npLogo = document.getElementById('np-logo');
const npName = document.getElementById('np-name');
const npTagline = document.getElementById('np-tagline');
const npBadge = document.getElementById('np-badge');

let hls = null;
let activeId = null;

function setOverlay(text, { error = false, hidden = false } = {}) {
  overlayText.textContent = text;
  overlay.classList.toggle('hidden', hidden);
  overlay.classList.toggle('error', error);
}

function setStatus(state, text) {
  statusEl.className = `status ${state}`;
  statusText.textContent = text;
}

function renderChannels(channels) {
  listEl.innerHTML = '';
  for (const channel of channels) {
    const li = document.createElement('li');
    li.className = 'channel-item';
    li.dataset.id = channel.id;
    li.innerHTML = `
      <div class="channel-logo" style="background:${channel.color}">${channel.logo}</div>
      <div class="channel-info">
        <div class="channel-name">${channel.name}</div>
        <div class="channel-cat">${channel.category}</div>
      </div>
      ${channel.live ? '<span class="live-dot" title="Tiešraide"></span>' : ''}
    `;
    li.addEventListener('click', () => playChannel(channel));
    listEl.appendChild(li);
  }
}

function markActive(id) {
  activeId = id;
  for (const item of listEl.querySelectorAll('.channel-item')) {
    item.classList.toggle('active', item.dataset.id === id);
  }
}

function playChannel(channel) {
  markActive(channel.id);

  npLogo.textContent = channel.logo;
  npLogo.style.background = channel.color;
  npName.textContent = channel.name;
  npTagline.textContent = channel.tagline;
  npBadge.hidden = !channel.live;

  setOverlay(`Ielādē ${channel.name}…`);

  // Browsers only allow autoplay for muted media, so start muted and let the
  // viewer unmute via the controls.
  video.muted = true;

  if (hls) {
    hls.destroy();
    hls = null;
  }

  const onPlaying = () => setOverlay('', { hidden: true });

  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(channel.stream);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setOverlay(`Neizdevās ielādēt ${channel.name}. Mēģiniet citu kanālu.`, {
          error: true,
        });
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari).
    video.src = channel.stream;
    video.play().catch(() => {});
  } else {
    setOverlay('Jūsu pārlūks neatbalsta HLS straumējumu.', { error: true });
    return;
  }

  video.removeEventListener('playing', onPlaying);
  video.addEventListener('playing', onPlaying, { once: true });
}

async function init() {
  try {
    const health = await fetch('/api/health').then((r) => r.json());
    setStatus('ok', `Tiešsaistē · ${health.channels} kanāli`);
  } catch {
    setStatus('error', 'Serveris nav pieejams');
  }

  try {
    const data = await fetch('/api/channels').then((r) => r.json());
    renderChannels(data.channels);
    if (data.channels.length > 0) {
      playChannel(data.channels[0]);
    }
  } catch {
    setOverlay('Neizdevās ielādēt kanālu sarakstu.', { error: true });
    setStatus('error', 'Kļūda ielādējot kanālus');
  }
}

init();
