import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { CALCULATION_VERSION } from "../../../packages/calculations/src/engine.ts";
import type { Category } from "../../../packages/types/src/index.ts";
import { verifyAccess } from "./auth.ts";
import type { Db } from "./db.ts";
import { validateBody } from "../../../packages/validation/src/validate.ts";
import {
  HttpError,
  addEntry,
  chat,
  checkinChallenge,
  checkinHabit,
  completeOnboarding,
  completeRecommendation,
  createDemo,
  createHabit,
  dashboard,
  deleteEntry,
  deleteUser,
  exportUser,
  getEcoScore,
  getFootprint,
  getUser,
  joinChallenge,
  listChallenges,
  listHabits,
  listRecommendations,
  loginUser,
  logoutUser,
  patchEntry,
  patchUser,
  recalculate,
  refreshSession,
  registerUser,
  scoreHistory,
  startRecommendation,
  type OnboardingBody,
} from "./service.ts";

const hits = new Map<string, { count: number; reset: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }
  const key = req.ip ?? "local";
  const now = Date.now();
  const slot = hits.get(key);
  if (!slot || slot.reset < now) {
    hits.set(key, { count: 1, reset: now + 10 * 60 * 1000 });
    next();
    return;
  }
  slot.count += 1;
  if (slot.count > 40) {
    res.status(429).json({ error: "Слишком много попыток. Подождите немного." });
    return;
  }
  next();
}

function readBody(name: string, body: unknown): Record<string, unknown> {
  const result = validateBody(name, body);
  if (!result.ok) throw new HttpError(400, result.errors[0] ?? "Проверьте поля формы");
  return result.value;
}

export function createApp(db: Db, secret: string, webRoot?: string): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
    );
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "eco-sled", calculationVersion: CALCULATION_VERSION });
  });

  app.post("/api/v1/auth/register", rateLimit, (req, res) => {
    const body = readBody("register", req.body);
    res.status(201).json(
      registerUser(db, secret, {
        name: String(body.name),
        email: String(body.email),
        password: String(body.password),
        language: body.language ? String(body.language) : undefined,
      }),
    );
  });

  app.post("/api/v1/auth/login", rateLimit, (req, res) => {
    const body = readBody("login", req.body);
    res.json(loginUser(db, secret, String(body.email), String(body.password)));
  });

  app.post("/api/v1/auth/refresh", (req, res) => {
    const body = readBody("refresh", req.body);
    res.json(refreshSession(db, secret, String(body.refreshToken)));
  });

  app.post("/api/v1/auth/logout", (req, res) => {
    const body = readBody("refresh", req.body);
    logoutUser(db, String(body.refreshToken));
    res.json({ ok: true });
  });

  app.post("/api/v1/auth/demo", rateLimit, (_req, res) => {
    res.status(201).json(createDemo(db, secret));
  });

  const auth: express.RequestHandler = (req, res, next) => {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const userId = token ? verifyAccess(token, secret) : null;
    if (!userId) {
      res.status(401).json({ error: "Нужно войти" });
      return;
    }
    res.locals.userId = userId;
    next();
  };

  app.use("/api/v1", auth);

  app.get("/api/v1/user", (req, res) => {
    res.json(getUser(db, res.locals.userId as string));
  });

  app.patch("/api/v1/user", (req, res) => {
    const body = readBody("user-patch", req.body);
    res.json(
      patchUser(db, res.locals.userId as string, {
        name: body.name ? String(body.name) : undefined,
        language: body.language ? String(body.language) : undefined,
        country: body.country as "DE" | "LV" | "EU" | undefined,
      }),
    );
  });

  app.delete("/api/v1/user", (req, res) => {
    deleteUser(db, res.locals.userId as string);
    res.json({ ok: true });
  });

  app.get("/api/v1/user/export", (req, res) => {
    res.json(exportUser(db, res.locals.userId as string));
  });

  app.post("/api/v1/onboarding", (req, res) => {
    const body = readBody("onboarding", req.body) as unknown as OnboardingBody;
    res.status(201).json(completeOnboarding(db, res.locals.userId as string, body));
  });

  app.get("/api/v1/footprint", (req, res) => {
    res.json(getFootprint(db, res.locals.userId as string));
  });

  app.put("/api/v1/footprint/profile", (req, res) => {
    const body = readBody("onboarding", req.body) as unknown as OnboardingBody;
    res.json(completeOnboarding(db, res.locals.userId as string, body));
  });

  app.post("/api/v1/footprint", (req, res) => {
    const body = readBody("footprint-entry", req.body);
    res.status(201).json(
      addEntry(db, res.locals.userId as string, {
        category: String(body.category),
        subcategory: String(body.subcategory),
        value: Number(body.value),
        unit: String(body.unit),
      }),
    );
  });

  app.patch("/api/v1/footprint/:id", (req, res) => {
    const body = readBody("footprint-entry", req.body);
    res.json(
      patchEntry(db, res.locals.userId as string, req.params.id ?? "", {
        subcategory: String(body.subcategory),
        value: Number(body.value),
        unit: String(body.unit),
      }),
    );
  });

  app.delete("/api/v1/footprint/:id", (req, res) => {
    res.json(deleteEntry(db, res.locals.userId as string, req.params.id ?? ""));
  });

  app.get("/api/v1/eco-score", (req, res) => {
    res.json(getEcoScore(db, res.locals.userId as string));
  });

  app.post("/api/v1/eco-score/recalculate", (req, res) => {
    res.json(recalculate(db, res.locals.userId as string));
  });

  app.get("/api/v1/eco-score/history", (req, res) => {
    res.json(scoreHistory(db, res.locals.userId as string));
  });

  app.get("/api/v1/dashboard", (req, res) => {
    res.json(dashboard(db, res.locals.userId as string));
  });

  app.get("/api/v1/recommendations", (req, res) => {
    res.json(listRecommendations(db, res.locals.userId as string));
  });

  app.post("/api/v1/recommendations/:id/start", (req, res) => {
    res.json(startRecommendation(db, res.locals.userId as string, req.params.id ?? ""));
  });

  app.post("/api/v1/recommendations/:id/complete", (req, res) => {
    res.json(completeRecommendation(db, res.locals.userId as string, req.params.id ?? ""));
  });

  app.get("/api/v1/challenges", (req, res) => {
    res.json(listChallenges(db, res.locals.userId as string));
  });

  app.post("/api/v1/challenges/:id/join", (req, res) => {
    res.status(201).json(joinChallenge(db, res.locals.userId as string, req.params.id ?? ""));
  });

  app.post("/api/v1/challenges/:id/checkin", (req, res) => {
    res.json(checkinChallenge(db, res.locals.userId as string, req.params.id ?? ""));
  });

  app.get("/api/v1/habits", (req, res) => {
    res.json(listHabits(db, res.locals.userId as string));
  });

  app.post("/api/v1/habits", (req, res) => {
    const body = readBody("habit", req.body);
    res.status(201).json(
      createHabit(db, res.locals.userId as string, {
        preset: body.preset ? String(body.preset) : undefined,
        name: body.name ? String(body.name) : undefined,
        category: body.category as Category | undefined,
        frequency: body.frequency as "daily" | "weekly" | undefined,
      }),
    );
  });

  app.post("/api/v1/habits/:id/checkin", (req, res) => {
    res.json(checkinHabit(db, res.locals.userId as string, req.params.id ?? ""));
  });

  app.post("/api/v1/ai/chat", (req, res) => {
    const body = readBody("ai-chat", req.body);
    res.json(chat(db, res.locals.userId as string, String(body.message)));
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Маршрут не найден" });
  });

  const root = webRoot ?? join(dirname(fileURLToPath(import.meta.url)), "../../web");
  app.use(express.static(root));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Не удалось прочитать запрос" });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Внутренняя ошибка" });
  });

  return app;
}
