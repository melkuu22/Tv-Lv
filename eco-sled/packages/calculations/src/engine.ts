import type {
  Category,
  CategoryImpact,
  EcoComputation,
  FootprintInput,
  HousingType,
} from "../../types/src/index.ts";

/**
 * Eco-Sled calculation eco-1.0.0.
 *
 * Order-of-magnitude factors for a first version, not a certified footprint.
 * Car: 0.17 kg CO₂/km. Electricity: 0.30 kg/kWh. Heat fuel: 0.18 kg/kWh.
 * Food bands follow published diet ranges (plant-based lower than daily meat).
 * Stored scores keep the version they were created with. Change the version
 * when a factor changes so old results are not silently rewritten.
 */
export const CALCULATION_VERSION = "eco-1.0.0";

export const WEIGHTS: Record<Category, number> = {
  transport: 0.25,
  energy: 0.2,
  food: 0.2,
  shopping: 0.2,
  waste: 0.1,
  water: 0.05,
};

const CAR_KG_PER_KM = 0.17;
const CAR_EUR_PER_KM = 0.25;
const PUBLIC_KM_WEEK = 80;
const PUBLIC_KG_PER_KM = 0.065;
const PUBLIC_EUR_MONTH = 49;
const EBIKE_KM_WEEK = 35;
const EBIKE_KG_PER_KM = 0.006;
const EBIKE_EUR_MONTH = 4;
const FLIGHT_KG = 200;
const FLIGHT_EUR = 140;
const ELEC_KG_PER_KWH = 0.3;
const HEAT_KG_PER_KWH = 0.18;
const ELEC_EUR_PER_KWH = 0.32;
const HEAT_EUR_PER_KWH = 0.11;
const WATER_EUR_PER_M3 = 4;
const WATER_KG_PER_M3 = 0.35;

const FOOD: Record<FootprintInput["diet"], { kg: number; eur: number }> = {
  meat_daily: { kg: 2200, eur: 320 },
  meat_regular: { kg: 1700, eur: 280 },
  meat_rare: { kg: 1200, eur: 250 },
  vegetarian: { kg: 900, eur: 230 },
  vegan: { kg: 650, eur: 220 },
};

const SHOPPING: Record<FootprintInput["shopping"], { kg: number; eur: number; score: number }> = {
  often: { kg: 700, eur: 140, score: 40 },
  sometimes: { kg: 380, eur: 70, score: 66 },
  rare: { kg: 180, eur: 30, score: 86 },
  secondhand: { kg: 120, eur: 35, score: 92 },
};

const WASTE: Record<FootprintInput["wasteSorting"], { kg: number; eur: number; score: number }> = {
  none: { kg: 180, eur: 16, score: 34 },
  some: { kg: 100, eur: 11, score: 58 },
  most: { kg: 55, eur: 7, score: 80 },
  all: { kg: 25, eur: 4, score: 94 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bandScore(value: number, good: number, poor: number): number {
  if (value <= good) return 100;
  if (value >= poor) {
    const extra = (value - poor) / poor;
    return clamp(round(20 - extra * 20), 0, 20);
  }
  const t = (value - good) / (poor - good);
  return clamp(round(100 - t * 80), 0, 100);
}

function housingBase(housing: HousingType): { elec: number; heat: number } {
  if (housing === "house") return { elec: 3600, heat: 14000 };
  if (housing === "other") return { elec: 2500, heat: 10000 };
  return { elec: 1800, heat: 7000 };
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "Сильный результат";
  if (score >= 70) return "Хороший уровень";
  if (score >= 55) return "Уверенный старт";
  if (score >= 40) return "Есть куда расти";
  return "Начнём с одного шага";
}

export function normalizeInput(input: FootprintInput): FootprintInput {
  const modes = [...new Set(input.modes)];
  const members = clamp(round(input.members), 1, 8);
  let carKmPerWeek = modes.includes("car") ? input.carKmPerWeek : 0;
  carKmPerWeek = clamp(carKmPerWeek, 0, 2000);
  let flightsPerYear = input.flightsPerYear;
  if (modes.includes("plane") && flightsPerYear < 1) flightsPerYear = 1;
  flightsPerYear = clamp(flightsPerYear, 0, 52);
  return {
    ...input,
    members,
    modes,
    carKmPerWeek,
    flightsPerYear,
    waterLitersPerDay: clamp(input.waterLitersPerDay, 20, 500),
    electricityKwhYear: input.electricityKwhYear,
    heatingKwhYear: input.heatingKwhYear,
  };
}

/** Same home size, typical habits. Money and CO₂ deltas are versus this, not versus a fictional flat. */
export function matchedBaseline(input: FootprintInput): FootprintInput {
  return {
    members: input.members,
    housing: input.housing,
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
}

export function heatingTurnDown(heatKwhYear: number): { savingsEurMonth: number; co2KgMonth: number } {
  return {
    savingsEurMonth: round((heatKwhYear * 0.06 * HEAT_EUR_PER_KWH) / 12),
    co2KgMonth: round((heatKwhYear * 0.06 * HEAT_KG_PER_KWH) / 12),
  };
}

interface RawComputation {
  categories: Record<Category, CategoryImpact>;
  co2KgYear: number;
  costEurMonth: number;
  perPersonCo2KgYear: number;
  score: number;
  confidence: number;
}

function emptyCategory(): CategoryImpact {
  return { score: 0, co2KgYear: 0, costEurMonth: 0, assumptions: [], details: {} };
}

function computeRaw(input: FootprintInput): RawComputation {
  const members = input.members;
  const categories = {
    transport: emptyCategory(),
    energy: emptyCategory(),
    food: emptyCategory(),
    shopping: emptyCategory(),
    waste: emptyCategory(),
    water: emptyCategory(),
  };

  let transportCo2 = 0;
  let transportEur = 0;
  if (input.modes.includes("car")) {
    transportCo2 += input.carKmPerWeek * 52 * CAR_KG_PER_KM;
    transportEur += (input.carKmPerWeek * 52 * CAR_EUR_PER_KM) / 12;
    categories.transport.assumptions.push(
      `Автомобиль: ${round(input.carKmPerWeek)} км в неделю на всё домохозяйство, ${CAR_KG_PER_KM} кг CO₂/км.`,
    );
  }
  if (input.modes.includes("public")) {
    const passes = Math.min(members, 2);
    transportCo2 += PUBLIC_KM_WEEK * 52 * PUBLIC_KG_PER_KM * passes;
    transportEur += PUBLIC_EUR_MONTH * passes;
    categories.transport.assumptions.push(
      `Общественный транспорт: ${passes} проездных по ${PUBLIC_EUR_MONTH} € и около ${PUBLIC_KM_WEEK} км в неделю на проездной.`,
    );
  }
  if (input.modes.includes("ebike")) {
    transportCo2 += EBIKE_KM_WEEK * 52 * EBIKE_KG_PER_KM;
    transportEur += EBIKE_EUR_MONTH;
    categories.transport.assumptions.push("E-bike: короткие поездки, электричество уже в оценке.");
  }
  if (input.modes.includes("bike")) {
    categories.transport.assumptions.push("Велосипед без прямых выбросов в этой версии расчёта.");
  }
  if (input.modes.includes("walk")) {
    categories.transport.assumptions.push("Пешие перемещения без прямых выбросов.");
  }
  if (input.flightsPerYear > 0) {
    transportCo2 += input.flightsPerYear * FLIGHT_KG;
    transportEur += (input.flightsPerYear * FLIGHT_EUR) / 12;
    categories.transport.assumptions.push(
      `Перелёты: ${round(input.flightsPerYear)} в год на домохозяйство, ${FLIGHT_KG} кг CO₂ за перелёт (короткая дистанция).`,
    );
  }
  const transportPerPerson = transportCo2 / members;
  categories.transport.score = bandScore(transportPerPerson, 300, 3000);
  categories.transport.co2KgYear = round(transportCo2);
  categories.transport.costEurMonth = round(transportEur);
  categories.transport.details = {
    carKmPerWeek: round(input.carKmPerWeek),
    flightsPerYear: round(input.flightsPerYear),
    perPersonCo2KgYear: round(transportPerPerson),
  };

  const base = housingBase(input.housing);
  const estimatedElec = round(base.elec * (0.65 + 0.35 * members));
  const estimatedHeat = round(base.heat * (0.8 + 0.2 * members));
  const electricity = input.electricityKwhYear ?? estimatedElec;
  const heating = input.heatingKwhYear ?? estimatedHeat;
  const energyCo2 = electricity * ELEC_KG_PER_KWH + heating * HEAT_KG_PER_KWH;
  const energyEur = (electricity * ELEC_EUR_PER_KWH + heating * HEAT_EUR_PER_KWH) / 12;
  categories.energy.score = bandScore(energyCo2 / members, 800, 4000);
  categories.energy.co2KgYear = round(energyCo2);
  categories.energy.costEurMonth = round(energyEur);
  categories.energy.details = {
    electricityKwhYear: round(electricity),
    heatingKwhYear: round(heating),
    perPersonCo2KgYear: round(energyCo2 / members),
  };
  categories.energy.assumptions.push(
    input.electricityKwhYear == null
      ? `Электричество оценено: ${round(electricity)} кВт⋅ч/год для такого жилья.`
      : `Электричество взято из ваших данных: ${round(electricity)} кВт⋅ч/год.`,
  );
  categories.energy.assumptions.push(
    input.heatingKwhYear == null
      ? `Отопление оценено: ${round(heating)} кВт⋅ч/год.`
      : `Отопление взято из ваших данных: ${round(heating)} кВт⋅ч/год.`,
  );

  const food = FOOD[input.diet];
  const foodCo2 = food.kg * members;
  categories.food.score = bandScore(food.kg, 700, 2300);
  categories.food.co2KgYear = round(foodCo2);
  categories.food.costEurMonth = round(food.eur * members);
  categories.food.details = { perPersonKgYear: food.kg, perPersonEurMonth: food.eur };
  categories.food.assumptions.push("Питание оценено по типу рациона на человека, без дневника блюд.");

  const shopping = SHOPPING[input.shopping];
  categories.shopping.score = shopping.score;
  categories.shopping.co2KgYear = round(shopping.kg * members);
  categories.shopping.costEurMonth = round(shopping.eur * members);
  categories.shopping.details = { perPersonKgYear: shopping.kg };
  categories.shopping.assumptions.push("Покупки — грубая оценка одежды и вещей, не чек из магазина.");

  const waste = WASTE[input.wasteSorting];
  categories.waste.score = waste.score;
  categories.waste.co2KgYear = round(waste.kg * members);
  categories.waste.costEurMonth = round(waste.eur * members);
  categories.waste.details = { perPersonKgYear: waste.kg };
  categories.waste.assumptions.push("Отходы оценены по тому, насколько полно вы сортируете.");

  const waterM3 = (input.waterLitersPerDay * 365 * members) / 1000;
  categories.water.score = clamp(round(100 - Math.max(0, input.waterLitersPerDay - 70) * 0.7), 0, 100);
  categories.water.co2KgYear = round(waterM3 * WATER_KG_PER_M3);
  categories.water.costEurMonth = round((waterM3 * WATER_EUR_PER_M3) / 12);
  categories.water.details = {
    litersPerDay: round(input.waterLitersPerDay),
    householdM3Year: round(waterM3),
  };
  categories.water.assumptions.push(
    `Вода: ${round(input.waterLitersPerDay)} л в день на человека, около ${WATER_EUR_PER_M3} €/м³.`,
  );

  const co2KgYear = (Object.values(categories) as CategoryImpact[]).reduce((sum, item) => sum + item.co2KgYear, 0);
  const costEurMonth = (Object.values(categories) as CategoryImpact[]).reduce(
    (sum, item) => sum + item.costEurMonth,
    0,
  );
  let score = 0;
  for (const key of Object.keys(WEIGHTS) as Category[]) {
    score += categories[key].score * WEIGHTS[key];
  }
  let confidence = 0.58;
  if (input.electricityKwhYear != null) confidence += 0.12;
  if (input.heatingKwhYear != null) confidence += 0.12;
  confidence = round2(Math.min(0.9, confidence));

  return {
    categories,
    co2KgYear,
    costEurMonth,
    perPersonCo2KgYear: round(co2KgYear / members),
    score: round(score),
    confidence,
  };
}

export function compute(input: FootprintInput): EcoComputation {
  const normalized = normalizeInput(input);
  const current = computeRaw(normalized);
  const baseline = computeRaw(normalizeInput(matchedBaseline(normalized)));
  const co2DeltaPct =
    baseline.co2KgYear === 0 ? 0 : round1(((current.co2KgYear - baseline.co2KgYear) / baseline.co2KgYear) * 100);
  return {
    version: CALCULATION_VERSION,
    score: current.score,
    label: scoreLabel(current.score),
    confidence: current.confidence,
    categories: current.categories,
    co2KgYear: current.co2KgYear,
    costEurMonth: current.costEurMonth,
    baselineCo2KgYear: baseline.co2KgYear,
    baselineCostEurMonth: baseline.costEurMonth,
    co2DeltaPct,
    moneyDeltaEurMonth: baseline.costEurMonth - current.costEurMonth,
    perPersonCo2KgYear: current.perPersonCo2KgYear,
  };
}
