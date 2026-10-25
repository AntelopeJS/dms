import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  MatrixCellState,
  MatrixColumn,
  MatrixData,
  MatrixRow,
  MatrixSelectOption,
} from "@antelopejs/interface-dms/base/matrix-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  ARTICLE,
  CURRENT_STORE,
  findStore,
  isInRange,
  LAST_DELIVERIES,
  SALES_30_DAYS,
  SIZES,
  STOCK,
  type Store,
  STORES,
  storesByRegion,
  WAREHOUSE,
} from "./data";
import { MATRIX_STOCK_API, PageMatrixStock } from "./page";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const JSON_TYPE = "application/json";
const BEST_SELLER_PAIRS = 4;
const PERCENT = 100;
const SALES_VIEW = "sales";

/** The status of a store's stock of the article, drawn as a pill. */
type StockStatus = "ok" | "low" | "out" | "transit";

const STATUS_OPTIONS: MatrixSelectOption[] = [
  { value: "ok", label: "En stock", tone: "success" },
  { value: "low", label: "Stock bas", tone: "warning" },
  { value: "out", label: "Rupture partielle", tone: "error" },
  { value: "transit", label: "Livraison en route", tone: "info" },
];

const STATUS_PILL_TONES = Object.fromEntries(
  STATUS_OPTIONS.map(({ value, tone }) => [value, tone]),
);

/** What the order form opens with, and what it posts back. */
interface OrderRequest {
  article?: string;
  size?: string;
  donor?: string;
  available?: number;
  customer?: string;
  phone?: string;
  email?: string;
  pickupStore?: string;
  note?: string;
}

const sizeColumns = (): MatrixColumn[] =>
  SIZES.map((size) => ({
    id: size,
    label: size,
    kind: "number",
    integer: true,
    align: "center",
    width: 64,
  }));

const STOCK_ANNEX: MatrixColumn[] = [
  // What the grid groups on (grouping.groupByField); the group headers show it.
  { id: "region", label: "Région", kind: "text", hidden: true, width: 140 },
  {
    id: "minimum",
    label: "Min.",
    description: "Paires à garder par pointure",
    kind: "number",
    align: "center",
    excludeFromTotals: true,
    width: 70,
  },
  {
    id: "delivery",
    label: "Dernière livraison",
    kind: "text",
    width: 140,
  },
  { id: "deliveredAt", label: "Le", kind: "date", width: 110 },
  {
    id: "status",
    label: "Statut",
    kind: "select",
    options: STATUS_OPTIONS,
    display: { type: "status_pill", options: { tones: STATUS_PILL_TONES } },
    width: 170,
  },
];

const SALES_ANNEX: MatrixColumn[] = [
  {
    id: "sellThrough",
    label: "Écoulement",
    description: "Ventes ÷ (ventes + stock), en %",
    kind: "number",
    align: "center",
    excludeFromTotals: true,
    width: 110,
  },
];

function stockStatus(store: Store): StockStatus {
  if (LAST_DELIVERIES[store.id]?.inTransit) return "transit";
  const inRange = store.sizes.map((size) => STOCK[store.id]?.[size] ?? 0);
  if (inRange.some((pairs) => pairs === 0)) return "out";
  if (inRange.some((pairs) => pairs < store.minimum)) return "low";
  return "ok";
}

function rowBase(store: Store): Omit<MatrixRow, "values" | "cells"> {
  const isCurrent = store.id === CURRENT_STORE;
  return {
    id: store.id,
    label: store.id,
    description: isCurrent ? `${store.name} · votre magasin` : store.name,
    tone: isCurrent ? "primary" : undefined,
  };
}

type CellTone = (store: Store, pairs: number) => MatrixCellState["tone"];

function sizeCells(
  store: Store,
  quantities: Record<string, number>,
  toneOf: CellTone,
): Record<string, MatrixCellState> {
  const cells: Record<string, MatrixCellState> = {};
  for (const size of SIZES) {
    if (!isInRange(store, size)) {
      cells[size] = { disabled: true };
      continue;
    }
    const tone = toneOf(store, quantities[size] ?? 0);
    if (tone) cells[size] = { tone };
  }
  return cells;
}

function sizeValues(
  store: Store,
  quantities: Record<string, number>,
): Record<string, number | null> {
  return Object.fromEntries(
    SIZES.map((size) => [
      size,
      isInRange(store, size) ? (quantities[size] ?? 0) : null,
    ]),
  );
}

const underMinimum: CellTone = (store, pairs) =>
  pairs < store.minimum ? "error" : undefined;

const bestSeller: CellTone = (_store, pairs) =>
  pairs >= BEST_SELLER_PAIRS ? "success" : undefined;

function stockRow(store: Store): MatrixRow {
  const quantities = STOCK[store.id] ?? {};
  const delivery = LAST_DELIVERIES[store.id];
  return {
    ...rowBase(store),
    values: {
      ...sizeValues(store, quantities),
      region: store.region,
      minimum: store.minimum,
      delivery: delivery?.number ?? null,
      deliveredAt: delivery?.date ?? null,
      status: stockStatus(store),
    },
    cells: sizeCells(store, quantities, underMinimum),
  };
}

function sum(quantities: Record<string, number>): number {
  return Object.values(quantities).reduce((total, pairs) => total + pairs, 0);
}

function salesRow(store: Store): MatrixRow {
  const sold = SALES_30_DAYS[store.id] ?? {};
  if (store.id === WAREHOUSE) {
    return {
      ...rowBase(store),
      description: `${store.name} · ne vend pas`,
      values: { sellThrough: null },
      readOnly: true,
    };
  }
  const soldPairs = sum(sold);
  const stockPairs = sum(STOCK[store.id] ?? {});
  return {
    ...rowBase(store),
    values: {
      ...sizeValues(store, sold),
      sellThrough: Math.round((soldPairs / (soldPairs + stockPairs)) * PERCENT),
    },
    cells: sizeCells(store, sold, bestSeller),
  };
}

function refuse(status: number, field: string, message: string): HTTPResult {
  return new HTTPResult(status, JSON.stringify({ field, message }), JSON_TYPE);
}

function availableAt(store: Store | undefined, size: string): number {
  if (!store || !isInRange(store, size)) return 0;
  return STOCK[store.id]?.[size] ?? 0;
}

function donorLabel(store: Store | undefined, fallback: string): string {
  return store ? `${store.id} — ${store.name}` : fallback;
}

/**
 * The routes of the "Stock by size and store" demo: the two read-only grids
 * (`?view=stock`, `?view=sales`) and the order form a cell opens, prefilled
 * with the cell's store and size.
 */
export class MatrixStockController extends Controller(MATRIX_STOCK_API) {
  @AuthUserWithPermission(PageMatrixStock)
  declare user: User;

  @Get("rows")
  list(@Parameter("view", "query") view?: string): MatrixData {
    if (view === SALES_VIEW) {
      return {
        columns: [...sizeColumns(), ...SALES_ANNEX],
        rows: STORES.map(salesRow),
      };
    }
    return {
      columns: [...sizeColumns(), ...STOCK_ANNEX],
      rows: storesByRegion().map(stockRow),
    };
  }

  @Get("order")
  orderForm(
    @Parameter("store", "query") storeId = "",
    @Parameter("size", "query") size = "",
  ): OrderRequest {
    const store = findStore(storeId);
    return {
      article: `${ARTICLE.label} — ${ARTICLE.code} (${ARTICLE.colour})`,
      size: SIZES.includes(size) ? size : "",
      donor: donorLabel(store, storeId),
      available: availableAt(store, size),
      customer: "",
      phone: "",
      email: "",
      pickupStore: CURRENT_STORE,
      note: "",
    };
  }

  @Post("order")
  order(
    @JSONBody() body: OrderRequest,
    @Parameter("store", "query") storeId = "",
    @Parameter("size", "query") sizeQuery = "",
  ) {
    const store = findStore(storeId);
    const size = sizeQuery || body.size || "";
    if (!body.customer?.trim()) {
      throw refuse(
        HTTP_BAD_REQUEST,
        "customer",
        "Indiquez le nom de la cliente.",
      );
    }
    if (!body.phone?.trim() && !body.email?.trim()) {
      throw refuse(
        HTTP_BAD_REQUEST,
        "phone",
        "Un téléphone ou un e-mail pour la prévenir.",
      );
    }
    if (availableAt(store, size) < 1) {
      throw refuse(
        HTTP_CONFLICT,
        "size",
        `Plus de paire en ${size || "cette pointure"} chez ${donorLabel(store, storeId || "ce magasin")}.`,
      );
    }
    const pickup =
      findStore(body.pickupStore ?? CURRENT_STORE)?.name ?? CURRENT_STORE;
    return {
      message: `Demande envoyée à ${store?.id}: 1 paire en ${size} pour ${body.customer.trim()}, retrait à ${pickup}.`,
    };
  }
}
