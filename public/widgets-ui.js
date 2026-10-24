import {
  RIGA,
  buildCurrentMonth,
  dueReminders,
  formatClock,
  formatLongDate,
  markFired,
  newReminder,
} from './widgets.js';

const LS_REMINDERS = 'tvlv:reminders';
const TICK_MS = 1000;
const REMIND_POLL_MS = 10000;

function loadReminders() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_REMINDERS) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveReminders(list) {
  try {
    localStorage.setItem(LS_REMINDERS, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function defaultDateTimeLocal(minutesAhead = 30) {
  const d = new Date(Date.now() + minutesAhead * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mountWidgets({ getChannels, getActiveId, playChannelById }) {
  const clockEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  const weatherRoot = document.getElementById('weather-widget');
  const calendarRoot = document.getElementById('calendar-widget');
  const reminderList = document.getElementById('reminder-list');
  const reminderForm = document.getElementById('reminder-form');
  const reminderText = document.getElementById('reminder-text');
  const reminderAt = document.getElementById('reminder-at');
  const toast = document.getElementById('reminder-toast');

  let reminders = loadReminders();

  function tickClock() {
    if (clockEl) clockEl.textContent = formatClock(new Date(), RIGA.timezone);
    if (dateEl) dateEl.textContent = formatLongDate(new Date(), RIGA.timezone);
  }

  function renderCalendar() {
    if (!calendarRoot) return;
    const month = buildCurrentMonth();
    calendarRoot.innerHTML = `
      <h4 class="widget-title">${escapeHtml(month.title)}</h4>
      <div class="cal-weekdays">${month.weekdays.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">
        ${month.cells
          .map((c) =>
            c.day
              ? `<span class="cal-day${c.today ? ' today' : ''}">${c.day}</span>`
              : '<span class="cal-day empty"></span>'
          )
          .join('')}
      </div>
    `;
  }

  function renderReminders() {
    if (!reminderList) return;
    const upcoming = reminders
      .filter((r) => !r.fired)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    if (!upcoming.length) {
      reminderList.innerHTML = '<li class="reminder-empty">Nav atgādinājumu.</li>';
      return;
    }
    reminderList.innerHTML = upcoming
      .map((r) => {
        const when = new Date(r.at);
        const time = when.toLocaleString('lv-LV', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `<li class="reminder-item" data-id="${escapeHtml(r.id)}">
          <div>
            <strong>${escapeHtml(r.text)}</strong>
            <span>${escapeHtml(time)}${r.channelName ? ` · ${escapeHtml(r.channelName)}` : ''}</span>
          </div>
          <button type="button" class="reminder-del" data-del="${escapeHtml(r.id)}" aria-label="Dzēst">✕</button>
        </li>`;
      })
      .join('');
  }

  function showToast(reminder) {
    if (!toast) return;
    toast.hidden = false;
    toast.innerHTML = `
      <span>⏰ ${escapeHtml(reminder.text)}${reminder.channelName ? ` · ${escapeHtml(reminder.channelName)}` : ''}</span>
      ${reminder.channelId ? `<button type="button" data-play="${escapeHtml(reminder.channelId)}">Skatīties</button>` : ''}
      <button type="button" data-dismiss="1">Aizvērt</button>
    `;
  }

  function checkDue() {
    const due = dueReminders(reminders);
    if (!due.length) return;
    reminders = markFired(reminders, due.map((r) => r.id));
    saveReminders(reminders);
    renderReminders();
    showToast(due[0]);
    try {
      if (window.Notification?.permission === 'granted') {
        new Notification(due[0].text, { body: due[0].channelName || 'Latvijas.tv' });
      }
    } catch {
      /* ignore */
    }
  }

  async function loadWeather() {
    if (!weatherRoot) return;
    weatherRoot.innerHTML = '<p class="widget-muted">Ielādē laiku…</p>';
    try {
      const data = await fetch('/api/weather').then((r) => {
        if (!r.ok) throw new Error('weather');
        return r.json();
      });
      const days = (data.daily || [])
        .slice(0, 3)
        .map(
          (d) =>
            `<span class="wx-day" title="${escapeHtml(d.label)}">${d.figure} ${
              d.high != null ? Math.round(d.high) : '–'
            }°</span>`
        )
        .join('');
      weatherRoot.innerHTML = `
        <div class="wx-now">
          <span class="widget-figure" aria-hidden="true">${data.figure || '🌡️'}</span>
          <div>
            <strong>${data.temperature != null ? `${Math.round(data.temperature)}°` : '–'}</strong>
            <p>${escapeHtml(data.city || RIGA.name)} · ${escapeHtml(data.label || '')}</p>
            <p class="widget-muted">Vējš ${data.wind != null ? Math.round(data.wind) : '–'} km/h</p>
          </div>
        </div>
        <div class="wx-days">${days}</div>
      `;
    } catch {
      weatherRoot.innerHTML = '<p class="widget-muted">Laiks nav pieejams.</p>';
    }
  }

  reminderList?.addEventListener('click', (e) => {
    const id = e.target.closest('[data-del]')?.getAttribute('data-del');
    if (!id) return;
    reminders = reminders.filter((r) => r.id !== id);
    saveReminders(reminders);
    renderReminders();
  });

  toast?.addEventListener('click', (e) => {
    const playId = e.target.closest('[data-play]')?.getAttribute('data-play');
    if (playId) playChannelById(playId);
    if (e.target.closest('[data-dismiss],[data-play]')) toast.hidden = true;
  });

  reminderForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const active = getChannels().find((c) => c.id === getActiveId());
    try {
      const reminder = newReminder({
        text: reminderText.value || active?.name || 'TV atgādinājums',
        at: reminderAt.value,
        channelId: active?.id || null,
        channelName: active?.name || null,
      });
      reminders = [...reminders, reminder];
      saveReminders(reminders);
      reminderText.value = '';
      reminderAt.value = defaultDateTimeLocal();
      renderReminders();
      if (window.Notification && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      reminderText.focus();
    }
  });

  if (reminderAt) reminderAt.value = defaultDateTimeLocal();
  tickClock();
  renderCalendar();
  renderReminders();
  loadWeather();
  setInterval(tickClock, TICK_MS);
  setInterval(checkDue, REMIND_POLL_MS);
  checkDue();
}
