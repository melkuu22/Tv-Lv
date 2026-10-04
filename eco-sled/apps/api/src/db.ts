import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ACHIEVEMENTS, CHALLENGES } from "../../../packages/calculations/src/catalog.ts";

export type Db = DatabaseSync;

const depths = new WeakMap<Db, number>();

export function openDatabase(filename: string): Db {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function transaction<T>(db: Db, fn: () => T): T {
  const depth = (depths.get(db) ?? 0) + 1;
  if (!Number.isInteger(depth) || depth < 1 || depth > 16) {
    throw new Error("Transaction depth is out of range");
  }
  const name = `eco_${depth}`;
  depths.set(db, depth);
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = fn();
    db.exec(`RELEASE ${name}`);
    depths.set(db, depth - 1);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    depths.set(db, depth - 1);
    throw error;
  }
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ru',
      country TEXT NOT NULL DEFAULT 'DE',
      consent_at TEXT NOT NULL,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      members_count INTEGER NOT NULL,
      housing_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS footprint_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      transport_modes TEXT NOT NULL,
      car_km_week REAL NOT NULL,
      flights_year REAL NOT NULL,
      diet TEXT NOT NULL,
      shopping TEXT NOT NULL,
      waste_sorting TEXT NOT NULL,
      water_liters_day REAL NOT NULL,
      electricity_kwh_year REAL,
      heating_kwh_year REAL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS footprint_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eco_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      transport_score INTEGER NOT NULL,
      energy_score INTEGER NOT NULL,
      food_score INTEGER NOT NULL,
      shopping_score INTEGER NOT NULL,
      waste_score INTEGER NOT NULL,
      water_score INTEGER NOT NULL,
      co2_kg_year INTEGER NOT NULL,
      savings_eur_month INTEGER NOT NULL,
      confidence REAL NOT NULL,
      calculation_version TEXT NOT NULL,
      breakdown TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_on TEXT NOT NULL,
      UNIQUE (habit_id, completed_on)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      duration_days INTEGER NOT NULL,
      reward_points INTEGER NOT NULL,
      savings_eur INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      last_checkin TEXT,
      UNIQUE (user_id, challenge_id)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      condition_value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id),
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE (user_id, code)
    );

    CREATE TABLE IF NOT EXISTS point_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_days (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const insertChallenge = db.prepare(`
    INSERT INTO challenges (id, code, title, description, category, difficulty, duration_days, reward_points, savings_eur, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(code) DO NOTHING
  `);
  for (const challenge of CHALLENGES) {
    insertChallenge.run(
      challenge.id,
      challenge.code,
      challenge.title,
      challenge.description,
      challenge.category,
      challenge.difficulty,
      challenge.durationDays,
      challenge.rewardPoints,
      challenge.savingsEur,
    );
  }

  const insertAchievement = db.prepare(`
    INSERT INTO achievements (id, code, name, description, icon, condition_type, condition_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO NOTHING
  `);
  for (const achievement of ACHIEVEMENTS) {
    insertAchievement.run(
      achievement.id,
      achievement.code,
      achievement.name,
      achievement.description,
      achievement.icon,
      achievement.conditionType,
      achievement.conditionValue,
    );
  }
}
