import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "../schemas");
const schemaNames = new Set([
  "register",
  "login",
  "refresh",
  "onboarding",
  "user-patch",
  "footprint-entry",
  "habit",
  "ai-chat",
]);

const ajv = new Ajv({ allErrors: true, strict: false });
const cache = new Map<string, ValidateFunction>();

function validator(name: string): ValidateFunction {
  if (!schemaNames.has(name)) throw new Error("Unknown schema");
  const existing = cache.get(name);
  if (existing) return existing;
  const schema = JSON.parse(readFileSync(join(schemaDir, `${name}.json`), "utf8")) as object;
  const compiled = ajv.compile(schema);
  cache.set(name, compiled);
  return compiled;
}

export function validateBody(name: string, data: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  const check = validator(name);
  if (check(data) && data && typeof data === "object" && !Array.isArray(data)) {
    return { ok: true, value: data as Record<string, unknown> };
  }
  const errors = (check.errors ?? []).map(formatError);
  return { ok: false, errors: errors.length > 0 ? errors : ["Проверьте поля формы"] };
}

function formatError(error: ErrorObject): string {
  const path = error.instancePath ? error.instancePath.replace(/^\//, "") : "форма";
  return `${path}: ${error.message ?? "некорректное значение"}`;
}
