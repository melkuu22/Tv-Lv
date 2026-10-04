import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CHALLENGES } from "../../../packages/calculations/src/catalog.ts";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

process.env.NODE_ENV = "test";
process.env.ECO_JWT_SECRET = "test-secret-please-change";

const db = openDatabase(":memory:");
const app = createApp(db, process.env.ECO_JWT_SECRET);
const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

after(() => {
  server.close();
});

const onboarding = {
  country: "LV",
  members: 2,
  housing: "apartment",
  modes: ["car", "public"],
  carKmPerWeek: 90,
  flightsPerYear: 1,
  diet: "meat_regular",
  shopping: "sometimes",
  wasteSorting: "some",
  waterLitersPerDay: 120,
  priority: "money",
};

async function send(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { status: response.status, data };
}

test("the web app is served", async () => {
  const response = await fetch(`${base}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Эко-След/);
  assert.match(html, /app\.js/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const policy = response.headers.get("content-security-policy") ?? "";
  assert.match(policy, /script-src 'self'/);
  assert.doesNotMatch(policy, /fonts\.googleapis\.com/);
});

test("health reports the calculation version", async () => {
  const { status, data } = await send("/api/health");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.calculationVersion, "eco-1.0.0");
});

test("registration requires consent and creates a session", async () => {
  const rejected = await send("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Анна", email: "anna@example.com", password: "secret-pass", consent: false },
  });
  assert.equal(rejected.status, 400);

  const created = await send("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Анна", email: "anna@example.com", password: "secret-pass", consent: true },
  });
  assert.equal(created.status, 201);
  assert.equal((created.data.user as { onboardingCompleted: boolean }).onboardingCompleted, false);
  assert.equal(typeof created.data.accessToken, "string");

  const early = await send("/api/v1/dashboard", { token: String(created.data.accessToken) });
  assert.equal(early.status, 409);
});

test("the core loop scores, recommends, and records progress", async () => {
  const created = await send("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Ивар", email: "ivar@example.com", password: "secret-pass", consent: true },
  });
  const token = String(created.data.accessToken);
  const started = await send("/api/v1/onboarding", { method: "POST", token, body: onboarding });
  assert.equal(started.status, 201);
  const score = started.data.score as { score: number; version: string; moneyDeltaEurMonth: number };
  assert.equal(score.version, "eco-1.0.0");
  assert.ok(score.score > 0 && score.score <= 100);

  const again = await send("/api/v1/eco-score/recalculate", { method: "POST", token });
  assert.equal((again.data as { score: number }).score, score.score);

  const board = await send("/api/v1/dashboard", { token });
  assert.equal(board.status, 200);
  const tips = board.data.today as { id: string; points: number } | null;
  assert.ok(tips);
  const done = await send(`/api/v1/recommendations/${tips.id}/complete`, { method: "POST", token });
  assert.equal(done.status, 200);
  const repeat = await send(`/api/v1/recommendations/${tips.id}/complete`, { method: "POST", token });
  assert.equal(repeat.status, 409);

  const profile = await send("/api/v1/user", { token });
  assert.ok((profile.data.points as number) >= 20 + tips.points);

  const challenges = await send("/api/v1/challenges", { token });
  const first = (challenges.data as unknown as { id: string }[])[0];
  assert.ok(first);
  const joined = await send(`/api/v1/challenges/${first?.id}/join`, { method: "POST", token });
  assert.equal(joined.status, 201);
  const checked = await send(`/api/v1/challenges/${first?.id}/checkin`, { method: "POST", token });
  assert.equal((checked.data as { progress: number }).progress, 1);
  const twice = await send(`/api/v1/challenges/${first?.id}/checkin`, { method: "POST", token });
  assert.equal(twice.status, 409);

  const habits = await send("/api/v1/habits", {
    method: "POST",
    token,
    body: { preset: "plant-lunch" },
  });
  const habitId = (habits.data.habits as { id: string }[])[0]?.id;
  assert.ok(habitId);
  const habitDone = await send(`/api/v1/habits/${habitId}/checkin`, { method: "POST", token });
  assert.equal(habitDone.status, 200);

  const entry = await send("/api/v1/footprint", {
    method: "POST",
    token,
    body: { category: "transport", subcategory: "car", value: 12, unit: "km" },
  });
  assert.equal(entry.status, 201);
  const entryId = (entry.data.entries as { id: string }[])[0]?.id;
  const removed = await send(`/api/v1/footprint/${entryId}`, { method: "DELETE", token });
  assert.equal((removed.data.entries as unknown[]).length, 0);

  const bike = await send("/api/v1/footprint/profile", {
    method: "PUT",
    token,
    body: { ...onboarding, modes: ["bike"], carKmPerWeek: 400 },
  });
  assert.equal(bike.status, 200);
  const footprint = await send("/api/v1/footprint", { token });
  assert.equal((footprint.data.profile as { carKmPerWeek: number }).carKmPerWeek, 0);

  const assistant = await send("/api/v1/ai/chat", {
    method: "POST",
    token,
    body: { message: "Как уменьшить мой след?" },
  });
  assert.equal(assistant.status, 200);
  assert.match(String(assistant.data.reply), /eco-1\.0\.0/);
  assert.match(String(assistant.data.reply), /не официальный/);
});

test("login, refresh rotation, export and deletion", async () => {
  await send("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Мара", email: "mara@example.com", password: "secret-pass", consent: true },
  });
  const bad = await send("/api/v1/auth/login", {
    method: "POST",
    body: { email: "mara@example.com", password: "wrong-password" },
  });
  assert.equal(bad.status, 401);

  const session = await send("/api/v1/auth/login", {
    method: "POST",
    body: { email: "mara@example.com", password: "secret-pass" },
  });
  const refreshed = await send("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.data.refreshToken },
  });
  assert.equal(refreshed.status, 200);
  const reused = await send("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.data.refreshToken },
  });
  assert.equal(reused.status, 401);

  const token = String(refreshed.data.accessToken);
  const exported = await send("/api/v1/user/export", { token });
  assert.equal((exported.data.user as { email: string }).email, "mara@example.com");

  const removed = await send("/api/v1/user", { method: "DELETE", token });
  assert.equal(removed.status, 200);
  const gone = await send("/api/v1/auth/login", {
    method: "POST",
    body: { email: "mara@example.com", password: "secret-pass" },
  });
  assert.equal(gone.status, 401);
});

test("demo account opens on a calculated score", async () => {
  const demo = await send("/api/v1/auth/demo", { method: "POST" });
  assert.equal(demo.status, 201);
  const token = String(demo.data.accessToken);
  const board = await send("/api/v1/dashboard", { token });
  assert.equal(board.status, 200);
  assert.equal(board.data.name, "РуссеЛ");
  assert.ok((board.data.score as { score: number }).score > 0);
  assert.ok((board.data.history as unknown[]).length >= 2);
});

test("postgres schema and seed cover the catalogue", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const migration = readFileSync(join(root, "database/migrations/001_init.sql"), "utf8");
  for (const table of [
    "users",
    "households",
    "footprint_entries",
    "eco_scores",
    "habits",
    "challenges",
    "recommendations",
    "achievements",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`, "i"));
  }
  const seed = readFileSync(join(root, "database/seeds/001_seed.sql"), "utf8");
  for (const challenge of CHALLENGES) {
    assert.ok(seed.includes(challenge.title));
  }
});
