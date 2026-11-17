import { ownEntry } from "../../own-entry";
import { type Point } from "./dashboard-types";

const MAX_GENERATED_ITEMS = 500;

export function clampCount(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = parseInt(value || `${fallback}`, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_GENERATED_ITEMS);
}

export const SAMPLE_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const PRESET_SEED_OFFSETS = {
  "this-month": 0,
  "last-month": 100,
  "this-quarter": 200,
  "last-quarter": 300,
  ytd: 400,
  "last-year": 500,
  "last-7-days": 600,
  "last-30-days": 700,
  custom: 800,
  "last-hour": 900,
  "last-24h": 1000,
  "last-90-days": 1100,
} satisfies Record<string, number>;

export function hashKey(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function deterministicRandom(seed: number, index: number): number {
  const value = Math.sin(seed * 9301 + index * 49297) * 233280;
  return value - Math.floor(value);
}

export interface NamedSeries {
  name: string;
  data: Point[];
}

export function buildSeries(
  name: string,
  size: number,
  seed: number,
  min: number,
  max: number,
): NamedSeries {
  const labels = SAMPLE_LABELS.slice(0, size);
  const data = labels.map((label, index) => ({
    x: label,
    y: Math.round(min + deterministicRandom(seed, index) * (max - min)),
  }));
  return { name, data };
}

export function resolveSeed(preset?: string, from?: string): number {
  const presetSeed = ownEntry(PRESET_SEED_OFFSETS, preset ?? "this-month") ?? 0;
  const dateSeed = from ? hashKey(from) : 0;
  return presetSeed + dateSeed;
}
