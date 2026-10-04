import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAssistantReply, worstCategory } from "./assistant.ts";
import { ACHIEVEMENTS, CATEGORY_LABELS, CHALLENGES } from "./catalog.ts";
import { CALCULATION_VERSION, WEIGHTS, compute, matchedBaseline, normalizeInput, scoreLabel } from "./engine.ts";
import { suggest } from "./recommendations.ts";
import type { FootprintInput } from "../../types/src/index.ts";

const baseInput: FootprintInput = {
  members: 1,
  housing: "apartment",
  modes: ["car"],
  carKmPerWeek: 150,
  flightsPerYear: 1,
  diet: "meat_regular",
  shopping: "sometimes",
  wasteSorting: "some",
  waterLitersPerDay: 130,
  electricityKwhYear: null,
  heatingKwhYear: null,
};

test("weights sum to 1 and the version is stable", () => {
  const sum = Object.values(WEIGHTS).reduce((total, value) => total + value, 0);
  assert.equal(Math.round(sum * 100), 100);
  assert.equal(CALCULATION_VERSION, "eco-1.0.0");
});

test("the same input always yields the same score", () => {
  assert.deepEqual(compute(baseInput), compute(baseInput));
});

test("typical habits in the same home sit on the baseline", () => {
  const result = compute(matchedBaseline(baseInput));
  assert.equal(result.moneyDeltaEurMonth, 0);
  assert.equal(result.co2DeltaPct, 0);
  assert.equal(result.confidence, 0.58);
  assert.ok(result.score >= 50 && result.score <= 75);
});

test("a careful household scores well above a heavy one", () => {
  const low = compute({
    ...baseInput,
    modes: ["bike", "walk"],
    carKmPerWeek: 200,
    flightsPerYear: 0,
    diet: "vegan",
    shopping: "secondhand",
    wasteSorting: "all",
    waterLitersPerDay: 80,
  });
  const high = compute({
    ...baseInput,
    housing: "house",
    modes: ["car", "plane"],
    carKmPerWeek: 400,
    flightsPerYear: 6,
    diet: "meat_daily",
    shopping: "often",
    wasteSorting: "none",
    waterLitersPerDay: 200,
  });
  assert.ok(low.score >= 80, `expected a high score, got ${low.score}`);
  assert.ok(high.score <= 45, `expected a low score, got ${high.score}`);
  assert.ok(low.score > high.score);
  assert.equal(low.categories.transport.details.carKmPerWeek, 0);
});

test("car kilometres are ignored when the car is not selected", () => {
  const normalized = normalizeInput({ ...baseInput, modes: ["bike"], carKmPerWeek: 300 });
  assert.equal(normalized.carKmPerWeek, 0);
});

test("plane selection counts at least one flight", () => {
  const normalized = normalizeInput({ ...baseInput, modes: ["plane"], flightsPerYear: 0, carKmPerWeek: 0 });
  assert.equal(normalized.flightsPerYear, 1);
});

test("real energy bills raise confidence and can change the score", () => {
  const estimated = compute(baseInput);
  const measured = compute({ ...baseInput, electricityKwhYear: 5000, heatingKwhYear: 14000 });
  assert.ok(measured.confidence > estimated.confidence);
  assert.ok(measured.categories.energy.score < estimated.categories.energy.score);
});

test("a car commute produces a concrete bike swap", () => {
  const result = compute({ ...baseInput, carKmPerWeek: 120, modes: ["car"] });
  const tips = suggest({ ...baseInput, carKmPerWeek: 120, modes: ["car"] }, result, "money");
  const swap = tips.find((item) => item.code === "swap-short-car-trips");
  assert.ok(swap);
  assert.equal(swap?.savingsEurMonth, 17);
  assert.equal(swap?.co2KgMonth, 12);
  assert.equal(tips[0]?.code, "swap-short-car-trips");
});

test("plant meals are not offered to someone who already eats plants", () => {
  const input = { ...baseInput, diet: "vegan" as const, modes: ["bike" as const], carKmPerWeek: 0, flightsPerYear: 0 };
  const tips = suggest(input, compute(input), "all");
  assert.equal(tips.some((item) => item.code === "two-plant-meals"), false);
});

test("score labels stay encouraging", () => {
  assert.equal(scoreLabel(72), "Хороший уровень");
  assert.equal(scoreLabel(20), "Начнём с одного шага");
});

test("the assistant only quotes calculation facts", () => {
  const result = compute(baseInput);
  const tips = suggest(baseInput, result, "all");
  const worst = worstCategory({
    transport: result.categories.transport.score,
    energy: result.categories.energy.score,
    food: result.categories.food.score,
    shopping: result.categories.shopping.score,
    waste: result.categories.waste.score,
    water: result.categories.water.score,
  });
  const reply = buildAssistantReply("Как уменьшить мой след?", {
    version: result.version,
    score: result.score,
    label: result.label,
    confidence: result.confidence,
    co2KgYear: result.co2KgYear,
    moneyDeltaEurMonth: result.moneyDeltaEurMonth,
    co2DeltaPct: result.co2DeltaPct,
    worstCategory: worst,
    worstLabel: CATEGORY_LABELS[worst],
    worstScore: result.categories[worst].score,
    categories: {
      transport: result.categories.transport.score,
      energy: result.categories.energy.score,
      food: result.categories.food.score,
      shopping: result.categories.shopping.score,
      waste: result.categories.waste.score,
      water: result.categories.water.score,
    },
    heatingKwhYear: result.categories.energy.details.heatingKwhYear ?? 0,
    electricityKwhYear: result.categories.energy.details.electricityKwhYear ?? 0,
    top: tips[0]
      ? {
          title: tips[0].title,
          savingsEurMonth: tips[0].savingsEurMonth,
          co2KgMonth: tips[0].co2KgMonth,
          category: tips[0].category,
        }
      : null,
  });
  assert.match(reply, new RegExp(String(result.score)));
  assert.match(reply, /eco-1\.0\.0/);
  assert.doesNotMatch(reply, /999/);
  assert.match(reply, /не официальный/);
});

test("catalog ids are unique", () => {
  const ids = [...CHALLENGES, ...ACHIEVEMENTS].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});
