import { type TopListItemPayload } from "./dashboard-types";
import { deterministicRandom } from "./dashboard-data";

export const TOP_PRODUCT_NAMES = [
  "Station météo Aurelia",
  "Hub USB-C Meteor",
  "Enceinte BT Cosmos",
  "Ampoule connectée Solis",
  "Cafetière automatique Nova",
  "Classeur à tiroirs Atlas",
  "Lampe LED Nova",
  "Souris sans fil Vega",
  "Blender Titan Pro",
  "Tapis de sol Vulcan",
  "Volant gaming Storm",
  "Trottinette électrique Gust",
  "Montre connectée Orion",
  "Casque audio Helix",
  "Clavier mécanique Quartz",
  "Webcam UltraHD Lyra",
  "Disque externe Vortex",
  "Routeur mesh Nimbus",
  "Imprimante 3D Hyperion",
  "Drone caméra Spectra",
  "Console de jeu Aether",
  "Aspirateur robot Pulsar",
  "Ventilateur tour Zephyr",
  "Friteuse à air Solara",
  "Sac à dos Nomade",
];

const TOP_PRODUCT_CATEGORIES = [
  "Domotique",
  "Accessoire",
  "Audio",
  "Domotique",
  "Électroménager",
  "Mobilier",
  "Éclairage",
  "Périphérique",
  "Électroménager",
  "Accessoire",
  "Gaming",
  "Mobilité",
  "Wearable",
  "Audio",
  "Périphérique",
  "Périphérique",
  "Stockage",
  "Réseau",
  "Impression",
  "Drone",
  "Gaming",
  "Domotique",
  "Électroménager",
  "Drone",
  "Accessoire",
];

const TOP_PRODUCT_SPARKLINE_LENGTH = 12;
const TOP_PRODUCT_UNKNOWN_CATEGORY = "Divers";
export const TOP_PRODUCT_DEFAULT_LIMIT = 10;
const TOP_PRODUCT_BASE_MIN = 800;
const TOP_PRODUCT_BASE_RANGE = 9500;
const TOP_PRODUCT_SPARK_MIN = 50;
const TOP_PRODUCT_SPARK_RANGE = 200;
const TOP_PRODUCT_DELTA_OFFSET = 0.3;
const TOP_PRODUCT_DELTA_AMPLITUDE = 200;
const TOP_PRODUCT_DELTA_PRECISION = 10;
const TOP_PRODUCT_SKU_BASE = 10000;
const TOP_PRODUCT_SEED_STEP = 13;
const TOP_PRODUCT_DELTA_SEED_INDEX = 99;

export interface BuildTopProductItemOptions {
  includeSparkline: boolean;
  includeDelta: boolean;
}

function buildTopProductSparkline(itemSeed: number): number[] {
  return Array.from({ length: TOP_PRODUCT_SPARKLINE_LENGTH }, (_, sparkIndex) =>
    Math.round(
      TOP_PRODUCT_SPARK_MIN +
        deterministicRandom(itemSeed, sparkIndex) * TOP_PRODUCT_SPARK_RANGE,
    ),
  );
}

function buildTopProductDelta(itemSeed: number): number {
  const raw =
    (deterministicRandom(itemSeed, TOP_PRODUCT_DELTA_SEED_INDEX) -
      TOP_PRODUCT_DELTA_OFFSET) *
    TOP_PRODUCT_DELTA_AMPLITUDE;
  return (
    Math.round(raw * TOP_PRODUCT_DELTA_PRECISION) / TOP_PRODUCT_DELTA_PRECISION
  );
}

export function buildTopProductItem(
  name: string,
  index: number,
  seed: number,
  options: BuildTopProductItemOptions,
): TopListItemPayload {
  const itemSeed = seed + index * TOP_PRODUCT_SEED_STEP;
  const baseValue =
    TOP_PRODUCT_BASE_MIN +
    deterministicRandom(itemSeed, 0) * TOP_PRODUCT_BASE_RANGE;
  const category =
    TOP_PRODUCT_CATEGORIES[index] ?? TOP_PRODUCT_UNKNOWN_CATEGORY;
  return {
    id: `prod-${index + 1}`,
    title: name,
    description: `${category} · SKU-${TOP_PRODUCT_SKU_BASE + index}`,
    value: Math.round(baseValue),
    sparkline: options.includeSparkline
      ? buildTopProductSparkline(itemSeed)
      : undefined,
    delta: options.includeDelta ? buildTopProductDelta(itemSeed) : null,
  };
}
