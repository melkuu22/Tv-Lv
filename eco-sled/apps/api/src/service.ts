import { randomUUID } from "node:crypto";
import { buildAssistantReply, categoryLabel, worstCategory } from "../../../packages/calculations/src/assistant.ts";
import { ACHIEVEMENTS, CATEGORY_LABELS, CHALLENGES, HABIT_PRESETS } from "../../../packages/calculations/src/catalog.ts";
import { compute, normalizeInput } from "../../../packages/calculations/src/engine.ts";
import { suggest } from "../../../packages/calculations/src/recommendations.ts";
import type {
  AssistantFacts,
  Category,
  EcoComputation,
  FootprintInput,
  Priority,
} from "../../../packages/types/src/index.ts";
import { hashPassword, hashToken, newRefreshToken, signAccess, verifyPassword } from "./auth.ts";
import { transaction, type Db } from "./db.ts";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  language: string;
  country: string;
  consent_at: string;
  onboarding_completed: number;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  transport_modes: string;
  car_km_week: number;
  flights_year: number;
  diet: FootprintInput["diet"];
  shopping: FootprintInput["shopping"];
  waste_sorting: FootprintInput["wasteSorting"];
  water_liters_day: number;
  electricity_kwh_year: number | null;
  heating_kwh_year: number | null;
  members_count: number;
  housing_type: FootprintInput["housing"];
  priority: Priority;
  country: string;
}

interface ScoreRow {
  id: string;
  score: number;
  confidence: number;
  calculation_version: string;
  breakdown: string;
  created_at: string;
}

interface RecommendationRow {
  id: string;
  code: string;
  title: string;
  description: string;
  category: Category;
  difficulty: number;
  cost_eur: number;
  savings_eur_month: number;
  co2_kg_month: number;
  points: number;
  impact: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

const DUMMY_HASH = hashPassword("dummy-password-for-timing");

export interface OnboardingBody {
  country: "DE" | "LV" | "EU";
  members: number;
  housing: FootprintInput["housing"];
  modes: FootprintInput["modes"];
  carKmPerWeek?: number;
  flightsPerYear?: number;
  diet: FootprintInput["diet"];
  shopping: FootprintInput["shopping"];
  wasteSorting: FootprintInput["wasteSorting"];
  waterLitersPerDay?: number;
  priority: Priority;
  electricityKwhYear?: number | null;
  heatingKwhYear?: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function greeting(date = new Date()): string {
  const hour = date.getUTCHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function userById(db: Db, id: string): UserRow {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!user) throw new HttpError(401, "Нужно войти снова");
  return user;
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    language: user.language,
    country: user.country,
    onboardingCompleted: user.onboarding_completed === 1,
    createdAt: user.created_at,
  };
}

function issueSession(db: Db, userId: string, secret: string) {
  const refreshToken = newRefreshToken();
  const created = nowIso();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO sessions (id, user_id, refresh_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), userId, hashToken(refreshToken), expires, created);
  return {
    accessToken: signAccess(userId, secret),
    refreshToken,
  };
}

function track(db: Db, userId: string | null, name: string, payload: Record<string, unknown> = {}): void {
  db.prepare("INSERT INTO analytics_events (id, user_id, name, payload, created_at) VALUES (?, ?, ?, ?, ?)").run(
    randomUUID(),
    userId,
    name,
    JSON.stringify(payload),
    nowIso(),
  );
}

function pointsOf(db: Db, userId: string): number {
  const row = db.prepare("SELECT COALESCE(SUM(points), 0) AS points FROM point_ledger WHERE user_id = ?").get(userId) as {
    points: number;
  };
  return row.points;
}

function addPoints(db: Db, userId: string, points: number, reason: string): void {
  if (points === 0) return;
  db.prepare("INSERT INTO point_ledger (id, user_id, points, reason, created_at) VALUES (?, ?, ?, ?, ?)").run(
    randomUUID(),
    userId,
    points,
    reason,
    nowIso(),
  );
}

function markDay(db: Db, userId: string, day = utcDay()): void {
  db.prepare("INSERT INTO activity_days (user_id, day) VALUES (?, ?) ON CONFLICT(user_id, day) DO NOTHING").run(userId, day);
}

export function streakOf(db: Db, userId: string, today = utcDay()): number {
  const rows = db.prepare("SELECT day FROM activity_days WHERE user_id = ?").all(userId) as { day: string }[];
  const days = new Set(rows.map((row) => row.day));
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  if (!days.has(cursor)) return 0;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}

function actionStats(db: Db, userId: string): { actions: number; savings: number; challenges: number } {
  const actions = db
    .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(savings_eur_month), 0) AS savings FROM recommendations WHERE user_id = ? AND status = 'completed'")
    .get(userId) as { count: number; savings: number };
  const challenges = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(c.savings_eur), 0) AS savings
       FROM user_challenges uc JOIN challenges c ON c.id = uc.challenge_id
       WHERE uc.user_id = ? AND uc.status = 'completed'`,
    )
    .get(userId) as { count: number; savings: number };
  return {
    actions: actions.count,
    savings: actions.savings + challenges.savings,
    challenges: challenges.count,
  };
}

function unlockAchievements(db: Db, userId: string): void {
  const stats = actionStats(db, userId);
  const streak = streakOf(db, userId);
  const user = userById(db, userId);
  const unlocked = new Set(
    (db.prepare("SELECT achievement_id FROM user_achievements WHERE user_id = ?").all(userId) as { achievement_id: string }[]).map(
      (row) => row.achievement_id,
    ),
  );
  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    const met =
      (achievement.conditionType === "onboarding" && user.onboarding_completed === 1) ||
      (achievement.conditionType === "actions" && stats.actions >= achievement.conditionValue) ||
      (achievement.conditionType === "streak" && streak >= achievement.conditionValue) ||
      (achievement.conditionType === "action_savings" && stats.savings >= achievement.conditionValue) ||
      (achievement.conditionType === "challenges" && stats.challenges >= achievement.conditionValue);
    if (!met) continue;
    db.prepare("INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)").run(
      userId,
      achievement.id,
      nowIso(),
    );
  }
}

function toInput(body: OnboardingBody): FootprintInput {
  return {
    members: body.members,
    housing: body.housing,
    modes: body.modes,
    carKmPerWeek: body.carKmPerWeek ?? (body.modes.includes("car") ? 80 : 0),
    flightsPerYear: body.flightsPerYear ?? 0,
    diet: body.diet,
    shopping: body.shopping,
    wasteSorting: body.wasteSorting,
    waterLitersPerDay: body.waterLitersPerDay ?? 120,
    electricityKwhYear: body.electricityKwhYear ?? null,
    heatingKwhYear: body.heatingKwhYear ?? null,
  };
}

function loadContext(db: Db, userId: string): { input: FootprintInput; priority: Priority; country: string } {
  const row = db
    .prepare(
      `SELECT p.transport_modes, p.car_km_week, p.flights_year, p.diet, p.shopping, p.waste_sorting,
              p.water_liters_day, p.electricity_kwh_year, p.heating_kwh_year,
              h.members_count, h.housing_type, h.priority, u.country
       FROM footprint_profiles p
       JOIN households h ON h.owner_id = p.user_id
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id = ?`,
    )
    .get(userId) as ProfileRow | undefined;
  if (!row) throw new HttpError(409, "Сначала расскажите о своих привычках");
  return {
    country: row.country,
    priority: row.priority,
    input: {
      members: row.members_count,
      housing: row.housing_type,
      modes: JSON.parse(row.transport_modes) as FootprintInput["modes"],
      carKmPerWeek: row.car_km_week,
      flightsPerYear: row.flights_year,
      diet: row.diet,
      shopping: row.shopping,
      wasteSorting: row.waste_sorting,
      waterLitersPerDay: row.water_liters_day,
      electricityKwhYear: row.electricity_kwh_year,
      heatingKwhYear: row.heating_kwh_year,
    },
  };
}

function insertScore(db: Db, userId: string, result: EcoComputation, createdAt = nowIso()): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO eco_scores (
      id, user_id, score, transport_score, energy_score, food_score, shopping_score, waste_score, water_score,
      co2_kg_year, savings_eur_month, confidence, calculation_version, breakdown, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    result.score,
    result.categories.transport.score,
    result.categories.energy.score,
    result.categories.food.score,
    result.categories.shopping.score,
    result.categories.waste.score,
    result.categories.water.score,
    result.co2KgYear,
    result.moneyDeltaEurMonth,
    result.confidence,
    result.version,
    JSON.stringify(result),
    createdAt,
  );
  return id;
}

function latestScore(db: Db, userId: string): (EcoComputation & { id: string; createdAt: string }) | null {
  const row = db
    .prepare("SELECT id, breakdown, created_at FROM eco_scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId) as ScoreRow | undefined;
  if (!row) return null;
  return { ...(JSON.parse(row.breakdown) as EcoComputation), id: row.id, createdAt: row.created_at };
}

function recommendationDto(row: RecommendationRow) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category],
    difficulty: row.difficulty,
    costEur: row.cost_eur,
    savingsEurMonth: row.savings_eur_month,
    co2KgMonth: row.co2_kg_month,
    points: row.points,
    impact: row.impact,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function refreshRecommendations(db: Db, userId: string, input: FootprintInput, result: EcoComputation, priority: Priority): void {
  const drafts = suggest(input, result, priority);
  const existing = db.prepare("SELECT code, status FROM recommendations WHERE user_id = ?").all(userId) as {
    code: string;
    status: string;
  }[];
  const sticky = new Set(existing.filter((row) => row.status !== "suggested").map((row) => row.code));
  db.prepare("DELETE FROM recommendations WHERE user_id = ? AND status = 'suggested'").run(userId);
  const insert = db.prepare(
    `INSERT INTO recommendations (
      id, user_id, code, title, description, category, difficulty, cost_eur, savings_eur_month, co2_kg_month,
      points, impact, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?)`,
  );
  for (const draft of drafts) {
    if (sticky.has(draft.code)) continue;
    insert.run(
      randomUUID(),
      userId,
      draft.code,
      draft.title,
      draft.description,
      draft.category,
      draft.difficulty,
      draft.costEur,
      draft.savingsEurMonth,
      draft.co2KgMonth,
      draft.points,
      draft.impact,
      nowIso(),
    );
  }
}

function saveProfile(db: Db, userId: string, body: OnboardingBody, first: boolean) {
  const input = normalizeInput(toInput(body));
  const timestamp = nowIso();
  db.prepare("UPDATE users SET country = ?, onboarding_completed = 1, updated_at = ? WHERE id = ?").run(
    body.country,
    timestamp,
    userId,
  );
  const household = db.prepare("SELECT id FROM households WHERE owner_id = ?").get(userId) as { id: string } | undefined;
  if (household) {
    db.prepare("UPDATE households SET members_count = ?, housing_type = ?, priority = ? WHERE owner_id = ?").run(
      input.members,
      input.housing,
      body.priority,
      userId,
    );
  } else {
    db.prepare(
      "INSERT INTO households (id, owner_id, members_count, housing_type, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID(), userId, input.members, input.housing, body.priority, timestamp);
  }
  db.prepare(
    `INSERT INTO footprint_profiles (
      user_id, transport_modes, car_km_week, flights_year, diet, shopping, waste_sorting, water_liters_day,
      electricity_kwh_year, heating_kwh_year, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      transport_modes = excluded.transport_modes,
      car_km_week = excluded.car_km_week,
      flights_year = excluded.flights_year,
      diet = excluded.diet,
      shopping = excluded.shopping,
      waste_sorting = excluded.waste_sorting,
      water_liters_day = excluded.water_liters_day,
      electricity_kwh_year = excluded.electricity_kwh_year,
      heating_kwh_year = excluded.heating_kwh_year,
      updated_at = excluded.updated_at`,
  ).run(
    userId,
    JSON.stringify(input.modes),
    input.carKmPerWeek,
    input.flightsPerYear,
    input.diet,
    input.shopping,
    input.wasteSorting,
    input.waterLitersPerDay,
    input.electricityKwhYear,
    input.heatingKwhYear,
    timestamp,
  );
  const normalized = compute(input);
  const scoreId = insertScore(db, userId, normalized, timestamp);
  refreshRecommendations(db, userId, input, normalized, body.priority);
  if (first) {
    addPoints(db, userId, 20, "onboarding");
    markDay(db, userId);
    track(db, userId, "onboarding_completed");
    track(db, userId, "eco_score_created", { score: normalized.score });
  } else {
    track(db, userId, "eco_score_created", { score: normalized.score, recalculated: true });
  }
  unlockAchievements(db, userId);
  return { score: { ...normalized, id: scoreId, createdAt: timestamp }, input };
}

export function registerUser(
  db: Db,
  secret: string,
  body: { name: string; email: string; password: string; language?: string },
) {
  const email = body.email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw new HttpError(409, "Такая почта уже зарегистрирована");
  const timestamp = nowIso();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, language, country, consent_at, onboarding_completed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'DE', ?, 0, ?, ?)`,
  ).run(id, email, body.name.trim(), hashPassword(body.password), body.language ?? "ru", timestamp, timestamp, timestamp);
  track(db, id, "user_registered");
  const user = userById(db, id);
  return { ...issueSession(db, id, secret), user: publicUser(user) };
}

export function loginUser(db: Db, secret: string, email: string, password: string) {
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
  const matches = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !matches) throw new HttpError(401, "Неверная почта или пароль");
  return { ...issueSession(db, user.id, secret), user: publicUser(user) };
}

export function refreshSession(db: Db, secret: string, refreshToken: string) {
  const hash = hashToken(refreshToken);
  const session = db.prepare("SELECT id, user_id, expires_at FROM sessions WHERE refresh_hash = ?").get(hash) as
    | { id: string; user_id: string; expires_at: string }
    | undefined;
  if (!session || session.expires_at <= nowIso()) {
    if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    throw new HttpError(401, "Сессия истекла");
  }
  db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
  const user = userById(db, session.user_id);
  return { ...issueSession(db, user.id, secret), user: publicUser(user) };
}

export function logoutUser(db: Db, refreshToken: string): void {
  db.prepare("DELETE FROM sessions WHERE refresh_hash = ?").run(hashToken(refreshToken));
}

export function getUser(db: Db, userId: string) {
  const user = userById(db, userId);
  const points = pointsOf(db, userId);
  const stats = actionStats(db, userId);
  const unlocked = new Map(
    (db.prepare("SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?").all(userId) as {
      achievement_id: string;
      unlocked_at: string;
    }[]).map((row) => [row.achievement_id, row.unlocked_at]),
  );
  return {
    ...publicUser(user),
    points,
    level: 1 + Math.floor(points / 150),
    levelProgress: (points % 150) / 150,
    streak: streakOf(db, userId),
    actionSavingsEur: stats.savings,
    achievements: ACHIEVEMENTS.map((achievement) => ({
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      unlockedAt: unlocked.get(achievement.id) ?? null,
    })),
  };
}

export function patchUser(db: Db, userId: string, body: { name?: string; language?: string; country?: "DE" | "LV" | "EU" }) {
  const user = userById(db, userId);
  db.prepare("UPDATE users SET name = ?, language = ?, country = ?, updated_at = ? WHERE id = ?").run(
    body.name?.trim() ?? user.name,
    body.language ?? user.language,
    body.country ?? user.country,
    nowIso(),
    userId,
  );
  return getUser(db, userId);
}

export function exportUser(db: Db, userId: string) {
  const take = (sql: string) => db.prepare(sql).all(userId);
  return {
    exportedAt: nowIso(),
    user: getUser(db, userId),
    household: db.prepare("SELECT * FROM households WHERE owner_id = ?").get(userId) ?? null,
    profile: db.prepare("SELECT * FROM footprint_profiles WHERE user_id = ?").get(userId) ?? null,
    entries: take("SELECT * FROM footprint_entries WHERE user_id = ?"),
    scores: take("SELECT id, score, calculation_version, breakdown, created_at FROM eco_scores WHERE user_id = ?"),
    habits: take("SELECT * FROM habits WHERE user_id = ?"),
    habitLogs: take("SELECT * FROM habit_logs WHERE user_id = ?"),
    challenges: take("SELECT * FROM user_challenges WHERE user_id = ?"),
    recommendations: take("SELECT * FROM recommendations WHERE user_id = ?"),
    points: take("SELECT * FROM point_ledger WHERE user_id = ?"),
    activity: take("SELECT * FROM activity_days WHERE user_id = ?"),
  };
}

export function deleteUser(db: Db, userId: string): void {
  track(db, userId, "user_deleted");
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function completeOnboarding(db: Db, userId: string, body: OnboardingBody) {
  return transaction(db, () => {
    const user = userById(db, userId);
    const saved = saveProfile(db, userId, body, user.onboarding_completed === 0);
    if (user.onboarding_completed === 0) track(db, userId, "onboarding_started");
    return {
      score: saved.score,
      recommendations: listRecommendations(db, userId),
    };
  });
}

export function getFootprint(db: Db, userId: string) {
  const user = userById(db, userId);
  if (user.onboarding_completed !== 1) return { profile: null, entries: [], score: null };
  const context = loadContext(db, userId);
  const entries = db
    .prepare("SELECT * FROM footprint_entries WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as Record<string, unknown>[];
  return {
    profile: {
      ...context.input,
      country: context.country,
      priority: context.priority,
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      category: entry.category,
      subcategory: entry.subcategory,
      value: entry.value,
      unit: entry.unit,
      periodStart: entry.period_start,
      periodEnd: entry.period_end,
      source: entry.source,
      createdAt: entry.created_at,
    })),
    score: latestScore(db, userId),
  };
}

export function addEntry(
  db: Db,
  userId: string,
  body: { category: string; subcategory: string; value: number; unit: string },
) {
  userById(db, userId);
  const id = randomUUID();
  const day = utcDay();
  db.prepare(
    `INSERT INTO footprint_entries (id, user_id, category, subcategory, value, unit, period_start, period_end, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
  ).run(id, userId, body.category, body.subcategory.trim(), body.value, body.unit.trim(), day, day, nowIso());
  return getFootprint(db, userId);
}

export function patchEntry(db: Db, userId: string, entryId: string, body: { value?: number; subcategory?: string; unit?: string }) {
  const row = db.prepare("SELECT id FROM footprint_entries WHERE id = ? AND user_id = ?").get(entryId, userId);
  if (!row) throw new HttpError(404, "Запись не найдена");
  const current = db.prepare("SELECT * FROM footprint_entries WHERE id = ?").get(entryId) as {
    value: number;
    subcategory: string;
    unit: string;
  };
  db.prepare("UPDATE footprint_entries SET value = ?, subcategory = ?, unit = ? WHERE id = ?").run(
    body.value ?? current.value,
    body.subcategory?.trim() ?? current.subcategory,
    body.unit?.trim() ?? current.unit,
    entryId,
  );
  return getFootprint(db, userId);
}

export function deleteEntry(db: Db, userId: string, entryId: string) {
  const row = db.prepare("DELETE FROM footprint_entries WHERE id = ? AND user_id = ?").run(entryId, userId);
  if (row.changes === 0) throw new HttpError(404, "Запись не найдена");
  return getFootprint(db, userId);
}

export function getEcoScore(db: Db, userId: string) {
  const score = latestScore(db, userId);
  if (!score) throw new HttpError(409, "Сначала расскажите о своих привычках");
  return score;
}

export function recalculate(db: Db, userId: string) {
  return transaction(db, () => {
    const context = loadContext(db, userId);
    const result = compute(context.input);
    const id = insertScore(db, userId, result);
    refreshRecommendations(db, userId, context.input, result, context.priority);
    track(db, userId, "eco_score_created", { score: result.score, recalculated: true });
    return { ...result, id, createdAt: nowIso() };
  });
}

export function scoreHistory(db: Db, userId: string) {
  const rows = db
    .prepare("SELECT score, created_at FROM eco_scores WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as { score: number; created_at: string }[];
  return rows.map((row) => ({ score: row.score, createdAt: row.created_at }));
}

export function listRecommendations(db: Db, userId: string) {
  const rows = db
    .prepare("SELECT * FROM recommendations WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as unknown as RecommendationRow[];
  return rows.map(recommendationDto);
}

function requireRecommendation(db: Db, userId: string, id: string): RecommendationRow {
  const row = db.prepare("SELECT * FROM recommendations WHERE id = ? AND user_id = ?").get(id, userId) as
    | RecommendationRow
    | undefined;
  if (!row) throw new HttpError(404, "Рекомендация не найдена");
  return row;
}

export function startRecommendation(db: Db, userId: string, id: string) {
  return transaction(db, () => {
    const row = requireRecommendation(db, userId, id);
    if (row.status === "completed") throw new HttpError(409, "Это уже сделано");
    if (row.status === "suggested") {
      db.prepare("UPDATE recommendations SET status = 'active' WHERE id = ?").run(id);
      track(db, userId, "recommendation_started", { code: row.code });
    }
    return recommendationDto({ ...row, status: row.status === "completed" ? row.status : "active" });
  });
}

export function completeRecommendation(db: Db, userId: string, id: string) {
  return transaction(db, () => {
    const row = requireRecommendation(db, userId, id);
    if (row.status === "completed") throw new HttpError(409, "Это уже сделано");
    const completedAt = nowIso();
    db.prepare("UPDATE recommendations SET status = 'completed', completed_at = ? WHERE id = ?").run(completedAt, id);
    addPoints(db, userId, row.points, `recommendation:${row.code}`);
    markDay(db, userId);
    unlockAchievements(db, userId);
    track(db, userId, "recommendation_completed", { code: row.code });
    return recommendationDto({ ...row, status: "completed", completed_at: completedAt });
  });
}

export function dashboard(db: Db, userId: string) {
  const user = userById(db, userId);
  const score = latestScore(db, userId);
  if (!score) throw new HttpError(409, "Сначала расскажите о своих привычках");
  const history = scoreHistory(db, userId);
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const context = loadContext(db, userId);
  const ranked = suggest(context.input, score, context.priority);
  const open = listRecommendations(db, userId).filter((item) => item.status !== "completed");
  const today = ranked.map((draft) => open.find((item) => item.code === draft.code)).find(Boolean) ?? null;
  const points = pointsOf(db, userId);
  return {
    greeting: greeting(),
    name: user.name,
    score,
    scoreChange: previous ? score.score - previous.score : 0,
    streak: streakOf(db, userId),
    points,
    level: 1 + Math.floor(points / 150),
    today,
    categories: (Object.keys(CATEGORY_LABELS) as Category[]).map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      score: score.categories[key].score,
      co2KgYear: score.categories[key].co2KgYear,
      costEurMonth: score.categories[key].costEurMonth,
    })),
    history,
  };
}

export function listChallenges(db: Db, userId: string) {
  const rows = db
    .prepare(
      `SELECT c.*, uc.progress, uc.status AS user_status, uc.last_checkin, uc.id AS membership_id
       FROM challenges c
       LEFT JOIN user_challenges uc ON uc.challenge_id = c.id AND uc.user_id = ?
       WHERE c.active = 1
       ORDER BY c.difficulty, c.title`,
    )
    .all(userId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category as Category],
    difficulty: row.difficulty,
    durationDays: row.duration_days,
    rewardPoints: row.reward_points,
    savingsEur: row.savings_eur,
    joined: Boolean(row.membership_id),
    progress: row.progress ?? 0,
    status: row.user_status ?? "available",
    lastCheckin: row.last_checkin ?? null,
  }));
}

export function joinChallenge(db: Db, userId: string, challengeId: string) {
  return transaction(db, () => {
    const challenge = db.prepare("SELECT id FROM challenges WHERE id = ? AND active = 1").get(challengeId);
    if (!challenge) throw new HttpError(404, "Челлендж не найден");
    const existing = db
      .prepare("SELECT id FROM user_challenges WHERE user_id = ? AND challenge_id = ?")
      .get(userId, challengeId);
    if (!existing) {
      db.prepare(
        `INSERT INTO user_challenges (id, user_id, challenge_id, progress, status, started_at)
         VALUES (?, ?, ?, 0, 'active', ?)`,
      ).run(randomUUID(), userId, challengeId, nowIso());
      track(db, userId, "challenge_started", { challengeId });
    }
    return listChallenges(db, userId).find((item) => item.id === challengeId);
  });
}

export function checkinChallenge(db: Db, userId: string, challengeId: string) {
  return transaction(db, () => {
    const row = db
      .prepare(
        `SELECT uc.id, uc.progress, uc.status, uc.last_checkin, c.duration_days, c.reward_points, c.code
         FROM user_challenges uc JOIN challenges c ON c.id = uc.challenge_id
         WHERE uc.user_id = ? AND uc.challenge_id = ?`,
      )
      .get(userId, challengeId) as
      | {
          id: string;
          progress: number;
          status: string;
          last_checkin: string | null;
          duration_days: number;
          reward_points: number;
          code: string;
        }
      | undefined;
    if (!row) throw new HttpError(409, "Сначала присоединитесь к челленджу");
    if (row.status === "completed") throw new HttpError(409, "Челлендж уже завершён");
    const today = utcDay();
    if (row.last_checkin === today) throw new HttpError(409, "Сегодня уже отмечено");
    const progress = row.progress + 1;
    const done = progress >= row.duration_days;
    db.prepare("UPDATE user_challenges SET progress = ?, status = ?, last_checkin = ?, completed_at = ? WHERE id = ?").run(
      progress,
      done ? "completed" : "active",
      today,
      done ? nowIso() : null,
      row.id,
    );
    addPoints(db, userId, done ? row.reward_points : 10, done ? `challenge:${row.code}` : `challenge-day:${row.code}`);
    markDay(db, userId, today);
    if (done) track(db, userId, "challenge_completed", { code: row.code });
    unlockAchievements(db, userId);
    return listChallenges(db, userId).find((item) => item.id === challengeId);
  });
}

export function listHabits(db: Db, userId: string) {
  const habits = db.prepare("SELECT * FROM habits WHERE user_id = ? AND status = 'active' ORDER BY created_at").all(userId) as {
    id: string;
    category: Category;
    name: string;
    frequency: string;
    created_at: string;
  }[];
  const today = utcDay();
  return {
    presets: HABIT_PRESETS,
    habits: habits.map((habit) => {
      const logs = db.prepare("SELECT completed_on FROM habit_logs WHERE habit_id = ?").all(habit.id) as { completed_on: string }[];
      const days = new Set(logs.map((log) => log.completed_on));
      let cursor = days.has(today) ? today : shiftDay(today, -1);
      let streak = 0;
      if (days.has(cursor)) {
        while (days.has(cursor)) {
          streak += 1;
          cursor = shiftDay(cursor, -1);
        }
      }
      return {
        id: habit.id,
        name: habit.name,
        category: habit.category,
        categoryLabel: CATEGORY_LABELS[habit.category],
        frequency: habit.frequency,
        checkedInToday: days.has(today),
        streak,
        createdAt: habit.created_at,
      };
    }),
  };
}

export function createHabit(
  db: Db,
  userId: string,
  body: { preset?: string; name?: string; category?: Category; frequency?: "daily" | "weekly" },
) {
  const preset = body.preset ? HABIT_PRESETS.find((item) => item.code === body.preset) : undefined;
  if (body.preset && !preset) throw new HttpError(400, "Такой привычки нет в списке");
  const name = preset?.name ?? body.name?.trim() ?? "";
  const category = preset?.category ?? body.category;
  const frequency = preset?.frequency ?? body.frequency ?? "daily";
  if (!name || !category) throw new HttpError(400, "Нужны название и категория");
  const duplicate = db.prepare("SELECT id FROM habits WHERE user_id = ? AND name = ? AND status = 'active'").get(userId, name);
  if (duplicate) throw new HttpError(409, "Такая привычка уже есть");
  db.prepare("INSERT INTO habits (id, user_id, category, name, frequency, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)").run(
    randomUUID(),
    userId,
    category,
    name,
    frequency,
    nowIso(),
  );
  return listHabits(db, userId);
}

export function checkinHabit(db: Db, userId: string, habitId: string) {
  return transaction(db, () => {
    const habit = db.prepare("SELECT id FROM habits WHERE id = ? AND user_id = ? AND status = 'active'").get(habitId, userId);
    if (!habit) throw new HttpError(404, "Привычка не найдена");
    const today = utcDay();
    const existing = db.prepare("SELECT id FROM habit_logs WHERE habit_id = ? AND completed_on = ?").get(habitId, today);
    if (existing) throw new HttpError(409, "Сегодня уже отмечено");
    db.prepare("INSERT INTO habit_logs (id, habit_id, user_id, completed_on) VALUES (?, ?, ?, ?)").run(
      randomUUID(),
      habitId,
      userId,
      today,
    );
    addPoints(db, userId, 5, "habit");
    markDay(db, userId, today);
    unlockAchievements(db, userId);
    return listHabits(db, userId);
  });
}

export function chat(db: Db, userId: string, message: string) {
  const context = loadContext(db, userId);
  const score = latestScore(db, userId);
  if (!score) throw new HttpError(409, "Сначала расскажите о своих привычках");
  const tips = suggest(context.input, score, context.priority);
  const scores = {
    transport: score.categories.transport.score,
    energy: score.categories.energy.score,
    food: score.categories.food.score,
    shopping: score.categories.shopping.score,
    waste: score.categories.waste.score,
    water: score.categories.water.score,
  };
  const worst = worstCategory(scores);
  const top = tips[0];
  const facts: AssistantFacts = {
    version: score.version,
    score: score.score,
    label: score.label,
    confidence: score.confidence,
    co2KgYear: score.co2KgYear,
    moneyDeltaEurMonth: score.moneyDeltaEurMonth,
    co2DeltaPct: score.co2DeltaPct,
    worstCategory: worst,
    worstLabel: categoryLabel(worst),
    worstScore: scores[worst],
    categories: scores,
    heatingKwhYear: score.categories.energy.details.heatingKwhYear ?? 0,
    electricityKwhYear: score.categories.energy.details.electricityKwhYear ?? 0,
    top: top
      ? {
          title: top.title,
          savingsEurMonth: top.savingsEurMonth,
          co2KgMonth: top.co2KgMonth,
          category: top.category,
        }
      : null,
  };
  track(db, userId, "ai_message_sent");
  return { reply: buildAssistantReply(message, facts), facts };
}

export function createDemo(db: Db, secret: string) {
  return transaction(db, () => {
    const registered = registerUser(db, secret, {
      name: "РуссеЛ",
      email: `demo+${randomUUID()}@eco-sled.local`,
      password: newRefreshToken(),
    });
    const body: OnboardingBody = {
      country: "DE",
      members: 2,
      housing: "apartment",
      modes: ["car", "ebike"],
      carKmPerWeek: 60,
      flightsPerYear: 1,
      diet: "meat_rare",
      shopping: "sometimes",
      wasteSorting: "most",
      waterLitersPerDay: 110,
      priority: "money",
    };
    saveProfile(db, registered.user.id, body, true);
    const before = compute({
      ...toInput(body),
      carKmPerWeek: 180,
      diet: "meat_regular",
      wasteSorting: "some",
      modes: ["car"],
    });
    insertScore(db, registered.user.id, before, new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString());
    for (const offset of [1, 2, 3]) markDay(db, registered.user.id, shiftDay(utcDay(), -offset));
    return { ...registered, user: getUser(db, registered.user.id) };
  });
}
