import type { Category } from "../../types/src/index.ts";

export interface ChallengeSeed {
  id: string;
  code: string;
  title: string;
  description: string;
  category: Category;
  difficulty: number;
  durationDays: number;
  rewardPoints: number;
  savingsEur: number;
}

export interface AchievementSeed {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  conditionType: "onboarding" | "actions" | "streak" | "action_savings" | "challenges";
  conditionValue: number;
}

export interface HabitPreset {
  code: string;
  name: string;
  category: Category;
  frequency: "daily" | "weekly";
}

export const CHALLENGES: ChallengeSeed[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    code: "no-bottles",
    title: "7 дней без одноразовых бутылок",
    description: "Вода и напитки из своей бутылки. Отмечайте день, если новая бутылка не понадобилась.",
    category: "waste",
    difficulty: 1,
    durationDays: 7,
    rewardPoints: 100,
    savingsEur: 15,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    code: "bike-week",
    title: "5 поездок без машины",
    description: "Пять дней, когда короткая дорога обошлась без автомобиля.",
    category: "transport",
    difficulty: 2,
    durationDays: 5,
    rewardPoints: 80,
    savingsEur: 12,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    code: "plant-weekdays",
    title: "Растительные будни",
    description: "Пять дней с растительным обедом или ужином.",
    category: "food",
    difficulty: 2,
    durationDays: 5,
    rewardPoints: 70,
    savingsEur: 18,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    code: "lights-out",
    title: "Час без лишнего света",
    description: "Семь вечеров, когда лишний свет в пустых комнатах выключен.",
    category: "energy",
    difficulty: 1,
    durationDays: 7,
    rewardPoints: 60,
    savingsEur: 6,
  },
];

export const ACHIEVEMENTS: AchievementSeed[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    code: "first_step",
    name: "Первый шаг",
    description: "Первый Eco Score посчитан.",
    icon: "🌱",
    conditionType: "onboarding",
    conditionValue: 1,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    code: "first_action",
    name: "Дело сделано",
    description: "Выполнена первая рекомендация.",
    icon: "✅",
    conditionType: "actions",
    conditionValue: 1,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    code: "week_streak",
    name: "7 дней",
    description: "Серия из семи дней с действием.",
    icon: "🔥",
    conditionType: "streak",
    conditionValue: 7,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    code: "saver",
    name: "Экономия",
    description: "Отмеченные действия дают от 20 €.",
    icon: "💶",
    conditionType: "action_savings",
    conditionValue: 20,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    code: "challenger",
    name: "Челлендж",
    description: "Один челлендж пройден до конца.",
    icon: "🏆",
    conditionType: "challenges",
    conditionValue: 1,
  },
];

export const HABIT_PRESETS: HabitPreset[] = [
  {
    code: "bike-instead",
    name: "Велосипед вместо короткой поездки",
    category: "transport",
    frequency: "weekly",
  },
  {
    code: "sort-packaging",
    name: "Сортировать упаковку",
    category: "waste",
    frequency: "daily",
  },
  {
    code: "plant-lunch",
    name: "Растительный обед",
    category: "food",
    frequency: "daily",
  },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  transport: "Транспорт",
  energy: "Энергия",
  food: "Питание",
  shopping: "Покупки",
  waste: "Отходы",
  water: "Вода",
};
