import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WEEKDAYS_LV,
  buildMonth,
  dueReminders,
  markFired,
  newReminder,
  parseOpenMeteo,
  weatherFigure,
} from '../public/widgets.js';

test('weather figures map WMO codes to icons', () => {
  assert.equal(weatherFigure(0).figure, '☀️');
  assert.equal(weatherFigure(3).figure, '☁️');
  assert.equal(weatherFigure(61).figure, '🌧️');
  assert.equal(weatherFigure(73).figure, '❄️');
  assert.equal(weatherFigure(95).figure, '⛈️');
});

test('October 2026 calendar starts on Thursday and marks today', () => {
  const month = buildMonth(2026, 9, new Date('2026-10-04T12:00:00+03:00'));
  assert.equal(month.title, 'oktobris 2026');
  assert.deepEqual(month.weekdays, WEEKDAYS_LV);
  const firstDay = month.cells.find((c) => c.day === 1);
  assert.ok(firstDay);
  assert.equal(month.cells.indexOf(firstDay), 3);
  assert.equal(month.cells.find((c) => c.day === 4)?.today, true);
});

test('reminders fire once when due', () => {
  const reminder = newReminder({
    text: 'LTV1 ziņas',
    at: '2026-10-04T12:00:00.000Z',
    channelId: 'ltv1',
    channelName: 'LTV1',
    now: 1,
  });
  assert.equal(reminder.id, 'rem-1');
  assert.equal(dueReminders([reminder], new Date('2026-10-04T11:59:00.000Z')).length, 0);
  const due = dueReminders([reminder], new Date('2026-10-04T12:00:01.000Z'));
  assert.equal(due[0].id, 'rem-1');
  const after = markFired([reminder], ['rem-1']);
  assert.equal(dueReminders(after, new Date('2026-10-04T13:00:00.000Z')).length, 0);
});

test('parseOpenMeteo keeps Riga figures and daily highs', () => {
  const parsed = parseOpenMeteo({
    current: { temperature_2m: 12.4, weather_code: 0, wind_speed_10m: 8.2 },
    daily: {
      time: ['2026-10-04'],
      weather_code: [3],
      temperature_2m_max: [14.1],
      temperature_2m_min: [6.2],
    },
  });
  assert.equal(parsed.city, 'Rīga');
  assert.equal(parsed.figure, '☀️');
  assert.equal(parsed.daily[0].figure, '☁️');
  assert.equal(parsed.daily[0].high, 14.1);
});
