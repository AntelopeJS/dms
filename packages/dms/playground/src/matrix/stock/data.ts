/**
 * The friend's shoe shops: one article, Tamaris Bottine Alma A260191, in
 * sizes 36 to 42, across the warehouse, three stores and the e-shop. The
 * Stock, Allocation and Correction demos share these axes.
 */

export const ARTICLE = {
  code: "A260191",
  label: "Tamaris Bottine Alma",
  colour: "Cognac",
} as const;

export const SIZES = ["36", "37", "38", "39", "40", "41", "42"];

/** The store the signed-in seller works in, highlighted on every grid. */
export const CURRENT_STORE = "LG4";
/** The warehouse: every size, the reserve the stores order from. */
export const WAREHOUSE = "ENT";

export interface Store {
  id: string;
  name: string;
  /** The sizes the store ordered of this article; the others are out of range. */
  sizes: string[];
  /** Pairs to keep of each ordered size; under it, the cell turns red. */
  minimum: number;
  /** Where the store is, the group the stock grid files it under. */
  region: string;
}

export const REGIONS = {
  belgium: "Belgique",
  luxembourg: "Luxembourg",
  logistics: "Entrepôt & web",
} as const;

export const STORES: Store[] = [
  {
    id: WAREHOUSE,
    name: "Entrepôt — Herstal",
    sizes: SIZES,
    minimum: 2,
    region: REGIONS.logistics,
  },
  {
    id: "NE1",
    name: "Namur Esplanade",
    sizes: ["37", "38", "39", "40", "41"],
    minimum: 2,
    region: REGIONS.belgium,
  },
  {
    id: CURRENT_STORE,
    name: "Liège Médiacité",
    sizes: ["36", "37", "38", "39", "40", "41"],
    minimum: 2,
    region: REGIONS.belgium,
  },
  {
    id: "LUX29",
    name: "Luxembourg Cloche d'Or",
    sizes: ["36", "37", "38", "39", "40"],
    minimum: 2,
    region: REGIONS.luxembourg,
  },
  {
    id: "WEB",
    name: "E-shop (stock dédié)",
    sizes: SIZES,
    minimum: 1,
    region: REGIONS.logistics,
  },
];

/** Quantities by store, then by size. */
export type StoreQuantities = Record<string, Record<string, number>>;

/** Pairs in stock today. */
export const STOCK: StoreQuantities = {
  ENT: { 36: 4, 37: 9, 38: 14, 39: 12, 40: 8, 41: 5, 42: 2 },
  NE1: { 37: 1, 38: 2, 39: 0, 40: 1, 41: 1 },
  LG4: { 36: 1, 37: 2, 38: 0, 39: 3, 40: 2, 41: 1 },
  LUX29: { 36: 0, 37: 1, 38: 2, 39: 2, 40: 1 },
  WEB: { 36: 2, 37: 3, 38: 5, 39: 4, 40: 3, 41: 2, 42: 1 },
};

/** Pairs sold over the last 30 days. */
export const SALES_30_DAYS: StoreQuantities = {
  ENT: {},
  NE1: { 37: 2, 38: 3, 39: 4, 40: 2, 41: 0 },
  LG4: { 36: 1, 37: 3, 38: 5, 39: 4, 40: 2, 41: 1 },
  LUX29: { 36: 1, 37: 2, 38: 2, 39: 1, 40: 0 },
  WEB: { 36: 2, 37: 4, 38: 6, 39: 5, 40: 3, 41: 1, 42: 1 },
};

/** The last delivery each store received of the article. */
export interface Delivery {
  number: string;
  date: string;
  /** A delivery on its way, not received yet. */
  inTransit?: boolean;
}

export const LAST_DELIVERIES: Record<string, Delivery> = {
  ENT: { number: "BL-26-04117", date: "2026-10-21" },
  NE1: { number: "BL-26-04122", date: "2026-10-14" },
  LG4: { number: "BL-26-04131", date: "2026-10-23", inTransit: true },
  LUX29: { number: "BL-26-04098", date: "2026-10-02" },
  WEB: { number: "BL-26-04120", date: "2026-10-16" },
};

const REGION_ORDER: string[] = Object.values(REGIONS);

/** The stores region by region, as a grid grouped on the region lists them. */
export function storesByRegion(): Store[] {
  return [...STORES].sort(
    (left, right) =>
      REGION_ORDER.indexOf(left.region) - REGION_ORDER.indexOf(right.region),
  );
}

/** Whether a store ordered a size: the others are hatched. */
export function isInRange(store: Store, size: string): boolean {
  return store.sizes.includes(size);
}

/** A store by its code. */
export function findStore(id: string): Store | undefined {
  return STORES.find((store) => store.id === id);
}
