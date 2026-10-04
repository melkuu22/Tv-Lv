-- Eco-Sled production schema (PostgreSQL).
-- The runnable MVP uses the same tables in SQLite. Apply this file when
-- moving the API to PostgreSQL; do not replay it onto the SQLite file.

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ru',
  country TEXT NOT NULL DEFAULT 'DE',
  consent_at TIMESTAMPTZ NOT NULL,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE households (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  members_count INTEGER NOT NULL CHECK (members_count BETWEEN 1 AND 8),
  housing_type TEXT NOT NULL CHECK (housing_type IN ('apartment', 'house', 'other')),
  priority TEXT NOT NULL CHECK (priority IN ('money', 'waste', 'co2', 'health', 'all')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE footprint_profiles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  transport_modes JSONB NOT NULL,
  car_km_week DOUBLE PRECISION NOT NULL DEFAULT 0,
  flights_year DOUBLE PRECISION NOT NULL DEFAULT 0,
  diet TEXT NOT NULL,
  shopping TEXT NOT NULL,
  waste_sorting TEXT NOT NULL,
  water_liters_day DOUBLE PRECISION NOT NULL,
  electricity_kwh_year DOUBLE PRECISION,
  heating_kwh_year DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE footprint_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX footprint_entries_user_idx ON footprint_entries (user_id, created_at DESC);

CREATE TABLE eco_scores (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  transport_score INTEGER NOT NULL,
  energy_score INTEGER NOT NULL,
  food_score INTEGER NOT NULL,
  shopping_score INTEGER NOT NULL,
  waste_score INTEGER NOT NULL,
  water_score INTEGER NOT NULL,
  co2_kg_year INTEGER NOT NULL,
  savings_eur_month INTEGER NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  calculation_version TEXT NOT NULL,
  breakdown JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eco_scores_user_idx ON eco_scores (user_id, created_at DESC);

CREATE TABLE habits (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE habit_logs (
  id UUID PRIMARY KEY,
  habit_id UUID NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  UNIQUE (habit_id, completed_on)
);

CREATE TABLE challenges (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  reward_points INTEGER NOT NULL,
  savings_eur INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE user_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES challenges (id),
  progress INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_checkin DATE,
  UNIQUE (user_id, challenge_id)
);

CREATE TABLE achievements (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL
);

CREATE TABLE user_achievements (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements (id),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE recommendations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  cost_eur INTEGER NOT NULL DEFAULT 0,
  savings_eur_month INTEGER NOT NULL,
  co2_kg_month INTEGER NOT NULL,
  points INTEGER NOT NULL,
  impact TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, code)
);

CREATE TABLE point_ledger (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_days (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
