import type { AssistantFacts, Category } from "../../types/src/index.ts";

const CATEGORY_LABELS: Record<Category, string> = {
  transport: "Транспорт",
  energy: "Энергия",
  food: "Питание",
  shopping: "Покупки",
  waste: "Отходы",
  water: "Вода",
};

function moneyLine(facts: AssistantFacts): string {
  if (facts.moneyDeltaEurMonth > 0) {
    return `По текущей оценке расходы примерно на ${facts.moneyDeltaEurMonth} € в месяц ниже типичных для такого же жилья.`;
  }
  if (facts.moneyDeltaEurMonth < 0) {
    return `По текущей оценке расходы примерно на ${Math.abs(facts.moneyDeltaEurMonth)} € в месяц выше типичных для такого же жилья.`;
  }
  return "По деньгам оценка сейчас рядом с типичной для такого же жилья.";
}

function topLine(facts: AssistantFacts): string | null {
  if (!facts.top) return null;
  return `Ближайший шаг из расчёта: ${facts.top.title}. Оценка эффекта: около ${facts.top.savingsEurMonth} € и ${facts.top.co2KgMonth} кг CO₂ в месяц.`;
}

export function buildAssistantReply(message: string, facts: AssistantFacts): string {
  const text = message.toLowerCase();
  const lines: string[] = [];

  if (/отоп|энерг|электр|свет|градус/.test(text)) {
    lines.push(`По энергии сейчас ${facts.categories.energy} из 100.`);
    lines.push(
      `В расчёте ${facts.version}: электричество ${facts.electricityKwhYear} кВт⋅ч/год, отопление ${facts.heatingKwhYear} кВт⋅ч/год.`,
    );
    if (facts.top?.category === "energy") {
      const step = topLine(facts);
      if (step) lines.push(step);
    } else {
      lines.push("Отдельного шага по отоплению в текущем списке нет — его место заняли более сильные категории.");
    }
  } else if (/деньг|эконом|евро|€|расход/.test(text)) {
    lines.push(moneyLine(facts));
    lines.push(`Eco Score при этом ${facts.score} — «${facts.label}».`);
    const step = topLine(facts);
    if (step) lines.push(step);
  } else if (/еда|питан|мяс|растен/.test(text)) {
    lines.push(`По питанию сейчас ${facts.categories.food} из 100.`);
    if (facts.top?.category === "food") {
      const step = topLine(facts);
      if (step) lines.push(step);
    }
  } else {
    lines.push(`Eco Score сейчас ${facts.score} — «${facts.label}». Уверенность оценки ${Math.round(facts.confidence * 100)}%.`);
    lines.push(
      `Сильнее всего оценку снижает «${facts.worstLabel}»: ${facts.worstScore} из 100. След домохозяйства около ${facts.co2KgYear} кг CO₂ в год.`,
    );
    lines.push(moneyLine(facts));
    const step = topLine(facts);
    if (step) lines.push(step);
  }

  lines.push(`Цифры только из расчёта ${facts.version}. Это не официальный углеродный отчёт.`);
  return lines.join("\n\n");
}

export function worstCategory(scores: Record<Category, number>): Category {
  let worst: Category = "transport";
  for (const key of Object.keys(scores) as Category[]) {
    if (scores[key] < scores[worst]) worst = key;
  }
  return worst;
}

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category];
}
