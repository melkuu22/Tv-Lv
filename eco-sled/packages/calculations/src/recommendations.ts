import type { EcoComputation, FootprintInput, Priority, RecommendationDraft } from "../../types/src/index.ts";
import { heatingTurnDown } from "./engine.ts";

const FOOD_EUR: Record<FootprintInput["diet"], number> = {
  meat_daily: 320,
  meat_regular: 280,
  meat_rare: 250,
  vegetarian: 230,
  vegan: 220,
};

const FOOD_KG: Record<FootprintInput["diet"], number> = {
  meat_daily: 2200,
  meat_regular: 1700,
  meat_rare: 1200,
  vegetarian: 900,
  vegan: 650,
};

function impactOf(savings: number, co2: number): RecommendationDraft["impact"] {
  if (co2 >= 15 || savings >= 20) return "high";
  if (co2 >= 6 || savings >= 8) return "medium";
  return "low";
}

function pointsFor(impact: RecommendationDraft["impact"]): number {
  if (impact === "high") return 50;
  if (impact === "medium") return 35;
  return 20;
}

function draft(
  partial: Omit<RecommendationDraft, "impact" | "points"> & { impact?: RecommendationDraft["impact"]; points?: number },
): RecommendationDraft {
  const impact = partial.impact ?? impactOf(partial.savingsEurMonth, partial.co2KgMonth);
  return {
    ...partial,
    impact,
    points: partial.points ?? pointsFor(impact),
  };
}

export function suggest(
  input: FootprintInput,
  result: EcoComputation,
  priority: Priority,
): RecommendationDraft[] {
  const items: RecommendationDraft[] = [];
  const members = input.members;

  if (input.modes.includes("car") && input.carKmPerWeek >= 40) {
    const kmMonth = 2 * 8 * 4.3;
    items.push(
      draft({
        code: "swap-short-car-trips",
        title: "Две короткие поездки — на велосипед",
        description:
          "Замените две поездки в неделю примерно по 8 км. Машину можно оставить для длинных маршрутов.",
        category: "transport",
        difficulty: 2,
        costEur: 0,
        savingsEurMonth: Math.round(kmMonth * 0.25),
        co2KgMonth: Math.round(kmMonth * 0.17),
      }),
    );
  }

  if (input.flightsPerYear >= 2) {
    items.push(
      draft({
        code: "skip-one-flight",
        title: "Один перелёт меньше в этом году",
        description: "Отказ от одного короткого перелёта распределён на месяц, чтобы его было с чем сравнить.",
        category: "transport",
        difficulty: 3,
        costEur: 0,
        savingsEurMonth: Math.round(140 / 12),
        co2KgMonth: Math.round(200 / 12),
      }),
    );
  }

  const heat = result.categories.energy.details.heatingKwhYear ?? 0;
  if (input.housing === "house" || result.categories.energy.score < 80) {
    const turned = heatingTurnDown(heat);
    if (turned.savingsEurMonth > 0 || turned.co2KgMonth > 0) {
      items.push(
        draft({
          code: "lower-heat",
          title: "Снизить отопление на один градус",
          description: "Минус 1 °C — около 6% тепла в этой версии расчёта. Цифры взяты из вашего отопления.",
          category: "energy",
          difficulty: 1,
          costEur: 0,
          savingsEurMonth: turned.savingsEurMonth,
          co2KgMonth: turned.co2KgMonth,
        }),
      );
    }
  }

  if (input.diet === "meat_daily" || input.diet === "meat_regular") {
    const savedEur = (FOOD_EUR[input.diet] - FOOD_EUR.vegetarian) * 0.15 * members;
    const savedKgYear = FOOD_KG[input.diet] * 0.15 * members;
    items.push(
      draft({
        code: "two-plant-meals",
        title: "Два растительных приёма пищи в неделю",
        description: "Не весь рацион, только два приёма. Оценка — 15% разницы между текущим рационом и вегетарианским.",
        category: "food",
        difficulty: 2,
        costEur: 0,
        savingsEurMonth: Math.max(1, Math.round(savedEur)),
        co2KgMonth: Math.max(1, Math.round(savedKgYear / 12)),
      }),
    );
  }

  if (input.shopping === "often") {
    const savedEur = (140 - 30) * 0.4 * members;
    const savedKg = (700 - 180) * 0.4 * members;
    items.push(
      draft({
        code: "clothes-pause",
        title: "Пауза на новые вещи на месяц",
        description: "Месяц без спонтанных покупок одежды и мелочей. Оценка — часть разницы между частыми и редкими покупками.",
        category: "shopping",
        difficulty: 2,
        costEur: 0,
        savingsEurMonth: Math.max(1, Math.round(savedEur)),
        co2KgMonth: Math.max(1, Math.round(savedKg / 12)),
      }),
    );
  }

  if (input.wasteSorting === "none" || input.wasteSorting === "some") {
    const currentEur = input.wasteSorting === "none" ? 16 : 11;
    const betterEur = input.wasteSorting === "none" ? 7 : 4;
    const currentKg = input.wasteSorting === "none" ? 180 : 100;
    const betterKg = input.wasteSorting === "none" ? 55 : 25;
    items.push(
      draft({
        code: "sort-packaging",
        title: "Отдельно складывать упаковку",
        description: "Пластик, бумага и стекло — в свои баки. Эффект посчитан как переход к более полной сортировке.",
        category: "waste",
        difficulty: 1,
        costEur: 0,
        savingsEurMonth: Math.max(1, Math.round((currentEur - betterEur) * members)),
        co2KgMonth: Math.max(1, Math.round(((currentKg - betterKg) * members) / 12)),
      }),
    );
  }

  if (input.waterLitersPerDay > 130) {
    const m3Month = (25 * 30 * members) / 1000;
    items.push(
      draft({
        code: "shorter-showers",
        title: "Душ короче на пару минут",
        description: "Минус около 25 литров в день на человека. В деньгах это вода и стоки.",
        category: "water",
        difficulty: 1,
        costEur: 0,
        savingsEurMonth: Math.max(1, Math.round(m3Month * 4)),
        co2KgMonth: Math.max(1, Math.round(m3Month * 0.35)),
      }),
    );
  }

  if (items.length === 0) {
    items.push(
      draft({
        code: "one-small-step",
        title: "Повторить одно полезное действие",
        description: "Отметьте то, что уже получается. Серия начинается со второго дня, не с идеального плана.",
        category: "waste",
        difficulty: 1,
        costEur: 0,
        savingsEurMonth: 0,
        co2KgMonth: 0,
        impact: "low",
        points: 15,
      }),
    );
  }

  const ranked = items.sort((a, b) => rank(b, priority) - rank(a, priority));
  return ranked.slice(0, 4);
}

function rank(item: RecommendationDraft, priority: Priority): number {
  let score = item.co2KgMonth * 1.2 + item.savingsEurMonth;
  if (priority === "money") score += item.savingsEurMonth * 1.5;
  if (priority === "co2") score += item.co2KgMonth * 1.5;
  if (priority === "waste" && item.category === "waste") score += 40;
  if (priority === "health" && (item.category === "food" || item.category === "transport")) score += 25;
  return score;
}
