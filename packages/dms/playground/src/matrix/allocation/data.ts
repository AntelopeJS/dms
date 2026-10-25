import { STOCK, STORES, type StoreQuantities } from "../stock/data";

/** The pairs of the delivery, by size: 24 in all. */
export const RECEIVED: Record<string, number> = {
  36: 2,
  37: 3,
  38: 6,
  39: 6,
  40: 4,
  41: 2,
  42: 1,
};

export const RECEIVED_TOTAL = Object.values(RECEIVED).reduce(
  (total, pairs) => total + pairs,
  0,
);

export const DELIVERY_NUMBER = "BL-26-04140";

interface CountDiscrepancy {
  store: string;
  size: string;
  pairs: number;
}

// What the stock count found unlike the system: a pair found in the back
// room, two pairs gone.
const DISCREPANCIES: CountDiscrepancy[] = [
  { store: "NE1", size: "38", pairs: 3 },
  { store: "LG4", size: "39", pairs: 2 },
  { store: "WEB", size: "40", pairs: 2 },
];

function emptyAllocation(): StoreQuantities {
  return Object.fromEntries(STORES.map((store) => [store.id, {}]));
}

function countAtStart(): StoreQuantities {
  const count: StoreQuantities = Object.fromEntries(
    STORES.map((store) => [store.id, { ...STOCK[store.id] }]),
  );
  for (const { store, size, pairs } of DISCREPANCIES) {
    count[store] = { ...count[store], [size]: pairs };
  }
  return count;
}

/** The split of the delivery the stores saved, nothing at first. */
export const allocation: StoreQuantities = emptyAllocation();

/**
 * The pairs the stock count found, by store and size: the "after" of the
 * correction grid, the stock in the system being the "before".
 */
export const counted: StoreQuantities = countAtStart();

/** Puts the demo back as it started. */
export function resetAllocationDemo(): void {
  Object.assign(allocation, emptyAllocation());
  Object.assign(counted, countAtStart());
}
