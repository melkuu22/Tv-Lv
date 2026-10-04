export const CATEGORIES = [
  "transport",
  "energy",
  "food",
  "shopping",
  "waste",
  "water",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const TRANSPORT_MODES = [
  "car",
  "public",
  "ebike",
  "bike",
  "walk",
  "plane",
] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const HOUSING_TYPES = ["apartment", "house", "other"] as const;
export type HousingType = (typeof HOUSING_TYPES)[number];

export const DIETS = [
  "meat_daily",
  "meat_regular",
  "meat_rare",
  "vegetarian",
  "vegan",
] as const;
export type Diet = (typeof DIETS)[number];

export const SHOPPING_HABITS = ["often", "sometimes", "rare", "secondhand"] as const;
export type ShoppingHabit = (typeof SHOPPING_HABITS)[number];

export const WASTE_LEVELS = ["none", "some", "most", "all"] as const;
export type WasteSorting = (typeof WASTE_LEVELS)[number];

export const PRIORITIES = ["money", "waste", "co2", "health", "all"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const COUNTRIES = ["DE", "LV", "EU"] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export interface FootprintInput {
  members: number;
  housing: HousingType;
  modes: TransportMode[];
  carKmPerWeek: number;
  flightsPerYear: number;
  diet: Diet;
  shopping: ShoppingHabit;
  wasteSorting: WasteSorting;
  waterLitersPerDay: number;
  electricityKwhYear: number | null;
  heatingKwhYear: number | null;
}

export interface CategoryImpact {
  score: number;
  co2KgYear: number;
  costEurMonth: number;
  assumptions: string[];
  details: Record<string, number>;
}

export interface EcoComputation {
  version: string;
  score: number;
  label: string;
  confidence: number;
  categories: Record<Category, CategoryImpact>;
  co2KgYear: number;
  costEurMonth: number;
  baselineCo2KgYear: number;
  baselineCostEurMonth: number;
  co2DeltaPct: number;
  moneyDeltaEurMonth: number;
  perPersonCo2KgYear: number;
}

export type ImpactLevel = "high" | "medium" | "low";

export interface RecommendationDraft {
  code: string;
  title: string;
  description: string;
  category: Category;
  difficulty: number;
  costEur: number;
  savingsEurMonth: number;
  co2KgMonth: number;
  points: number;
  impact: ImpactLevel;
}

export interface AssistantFacts {
  version: string;
  score: number;
  label: string;
  confidence: number;
  co2KgYear: number;
  moneyDeltaEurMonth: number;
  co2DeltaPct: number;
  worstCategory: Category;
  worstLabel: string;
  worstScore: number;
  categories: Record<Category, number>;
  heatingKwhYear: number;
  electricityKwhYear: number;
  top: {
    title: string;
    savingsEurMonth: number;
    co2KgMonth: number;
    category: Category;
  } | null;
}
