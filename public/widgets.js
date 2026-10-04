// Shared TV widgets: weather figures, Riga calendar, programme reminders.

export const RIGA = {
  name: 'Rīga',
  latitude: 56.9496,
  longitude: 24.1052,
  timezone: 'Europe/Riga',
};

export const WEEKDAYS_LV = ['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'];
export const WEEKDAYS_LONG_LV = [
  'svētdiena',
  'pirmdiena',
  'otrdiena',
  'trešdiena',
  'ceturtdiena',
  'piektdiena',
  'sestdiena',
];
export const MONTHS_LV = [
  'janvāris',
  'februāris',
  'marts',
  'aprīlis',
  'maijs',
  'jūnijs',
  'jūlijs',
  'augusts',
  'septembris',
  'oktobris',
  'novembris',
  'decembris',
];

/** WMO weather code → large figure + Latvian label. */
export function weatherFigure(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return { figure: '🌡️', label: 'Laiks' };
  if (n === 0) return { figure: '☀️', label: 'Skaidrs' };
  if (n <= 2) return { figure: '🌤️', label: 'Daļēji mākoņains' };
  if (n === 3) return { figure: '☁️', label: 'Mākoņains' };
  if (n === 45 || n === 48) return { figure: '🌫️', label: 'Migla' };
  if (n >= 51 && n <= 67) return { figure: '🌧️', label: 'Lietus' };
  if (n >= 71 && n <= 77) return { figure: '❄️', label: 'Sniegs' };
  if (n >= 80 && n <= 82) return { figure: '🌦️', label: 'Lietusgāzes' };
  if (n >= 85 && n <= 86) return { figure: '🌨️', label: 'Sniega gāzes' };
  if (n >= 95) return { figure: '⛈️', label: 'Pērkona negaiss' };
  return { figure: '🌡️', label: 'Laiks' };
}

export function formatClock(date = new Date(), timeZone = RIGA.timezone) {
  const parts = new Intl.DateTimeFormat('lv-LV', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${pick('hour')}:${pick('minute')}:${pick('second')}`;
}

export function formatLongDate(date = new Date(), timeZone = RIGA.timezone) {
  const local = new Date(date.toLocaleString('en-US', { timeZone }));
  const weekday = WEEKDAYS_LONG_LV[local.getDay()];
  const month = MONTHS_LV[local.getMonth()];
  return `${local.getDate()}. ${month} (${weekday})`;
}

export function buildMonth(year, monthIndex, today = new Date(), timeZone = RIGA.timezone) {
  const localToday = new Date(today.toLocaleString('en-US', { timeZone }));
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Monday-first grid (Latvia). JS getDay(): 0 Sunday.
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < mondayOffset; i++) cells.push({ day: null, today: false });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      today:
        day === localToday.getDate() &&
        monthIndex === localToday.getMonth() &&
        year === localToday.getFullYear(),
    });
  }
  return {
    year,
    monthIndex,
    title: `${MONTHS_LV[monthIndex]} ${year}`,
    weekdays: WEEKDAYS_LV,
    cells,
  };
}

export function buildCurrentMonth(now = new Date(), timeZone = RIGA.timezone) {
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  return buildMonth(local.getFullYear(), local.getMonth(), now, timeZone);
}

export function newReminder({ text, at, channelId = null, channelName = null, now = Date.now() }) {
  const when = new Date(at);
  if (!text || !String(text).trim()) throw new Error('reminder_text_required');
  if (Number.isNaN(when.getTime())) throw new Error('reminder_time_invalid');
  return {
    id: `rem-${now}`,
    text: String(text).trim(),
    at: when.toISOString(),
    channelId: channelId || null,
    channelName: channelName || null,
    fired: false,
  };
}

export function dueReminders(reminders, now = new Date()) {
  const t = now.getTime();
  return reminders.filter((r) => !r.fired && new Date(r.at).getTime() <= t);
}

export function markFired(reminders, ids) {
  const set = new Set(ids);
  return reminders.map((r) => (set.has(r.id) ? { ...r, fired: true } : r));
}

export function openMeteoUrl() {
  const q = new URLSearchParams({
    latitude: String(RIGA.latitude),
    longitude: String(RIGA.longitude),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: RIGA.timezone,
    forecast_days: '3',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function parseOpenMeteo(body) {
  const current = body?.current || {};
  const daily = body?.daily || {};
  const code = current.weather_code;
  const { figure, label } = weatherFigure(code);
  const days = (daily.time || []).map((date, i) => {
    const fig = weatherFigure(daily.weather_code?.[i]);
    return {
      date,
      figure: fig.figure,
      label: fig.label,
      high: daily.temperature_2m_max?.[i] ?? null,
      low: daily.temperature_2m_min?.[i] ?? null,
    };
  });
  return {
    city: RIGA.name,
    temperature: current.temperature_2m ?? null,
    wind: current.wind_speed_10m ?? null,
    code,
    figure,
    label,
    daily: days,
  };
}

export async function fetchRigaWeather(load = fetch) {
  const res = await load(openMeteoUrl());
  if (!res.ok) throw new Error(`weather_http_${res.status}`);
  return parseOpenMeteo(await res.json());
}
