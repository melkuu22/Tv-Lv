-- Reference data for PostgreSQL. The API seeds the same rows on SQLite startup.

INSERT INTO challenges (id, code, title, description, category, difficulty, duration_days, reward_points, savings_eur, active)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'no-bottles',
    '7 дней без одноразовых бутылок',
    'Вода и напитки из своей бутылки. Отмечайте день, если новая бутылка не понадобилась.',
    'waste', 1, 7, 100, 15, TRUE
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'bike-week',
    '5 поездок без машины',
    'Пять дней, когда короткая дорога обошлась без автомобиля.',
    'transport', 2, 5, 80, 12, TRUE
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'plant-weekdays',
    'Растительные будни',
    'Пять дней с растительным обедом или ужином.',
    'food', 2, 5, 70, 18, TRUE
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'lights-out',
    'Час без лишнего света',
    'Семь вечеров, когда лишний свет в пустых комнатах выключен.',
    'energy', 1, 7, 60, 6, TRUE
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO achievements (id, code, name, description, icon, condition_type, condition_value)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'first_step', 'Первый шаг', 'Первый Eco Score посчитан.', '🌱', 'onboarding', 1),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'first_action', 'Дело сделано', 'Выполнена первая рекомендация.', '✅', 'actions', 1),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'week_streak', '7 дней', 'Серия из семи дней с действием.', '🔥', 'streak', 7),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'saver', 'Экономия', 'Отмеченные действия дают от 20 €.', '💶', 'action_savings', 20),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'challenger', 'Челлендж', 'Один челлендж пройден до конца.', '🏆', 'challenges', 1)
ON CONFLICT (code) DO NOTHING;
