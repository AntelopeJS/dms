import { seededRandom } from "../query";

/** A JSON value, as a document field holds it. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

/** A JSON object: a request body, a nested document. */
export interface JsonObject {
  [key: string]: JsonValue;
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpVerb = (typeof HTTP_METHODS)[number];

export const REQUEST_LABELS = ["slow", "retried", "flagged", "internal"];

/**
 * A document of the `api_requests` collection, as a database browser lists
 * it: scalar fields, a nested body, headers, the SQL the request ran and
 * free notes, some of them empty (`null`).
 */
export interface RequestDocument {
  _id: string;
  ref: string;
  method: HttpVerb;
  path: string;
  status: number;
  durationMs: number | null;
  cached: boolean;
  receivedAt: string;
  client: string | null;
  headers: Record<string, string>;
  body: JsonValue;
  sql: string;
  labels: string[];
  notes: string | null;
}

/** The fields a save may write, all of them but the ids. */
export type RequestField = Exclude<keyof RequestDocument, "_id" | "ref">;

interface RouteTemplate {
  method: HttpVerb;
  path: (serial: number) => string;
  body: (serial: number) => JsonValue;
  sql: string;
  statuses: number[];
}

const DOCUMENT_COUNT = 300;
const SEED = 20261025;
const STEP_MINUTES = 7;
const MINUTE_MS = 60_000;
const LOG_END = Date.parse("2026-10-25T09:00:00.000Z");
const OBJECT_ID_MACHINE = "b7e21c4a90";
const OBJECT_ID_COUNTER = 0x3f2a10;
const HEX = 16;
const SECONDS_MS = 1000;
const MAX_DURATION_MS = 1800;
const MIN_DURATION_MS = 12;
const SLOW_RATIO = 0.08;
const CACHED_RATIO = 0.3;
const NOTE_RATIO = 0.12;
const LABEL_RATIO = 0.2;
const TIMEOUT_STATUS = 504;
const SERVER_ERROR = 500;
const SLOW_MS = 900;
const TYPICAL_DURATION_SPREAD_MS = 300;
const REF_DIGITS = 4;
const ARTICLE = "A260191";
const SIZES = [36, 37, 38, 39, 40, 41, 42];
const STORES = ["ENT", "NE1", "LG4", "LUX29", "WEB"];

const CLIENTS: (string | null)[] = [
  "pos-lg4",
  "pos-ne1",
  "pos-lux29",
  "eshop-front",
  "backoffice",
  "stripe-webhook",
  null,
];

const USER_AGENTS: Record<string, string> = {
  "pos-lg4": "AltabPOS/4.2 (Windows 11; LG4-caisse-1)",
  "pos-ne1": "AltabPOS/4.2 (Windows 11; NE1-caisse-2)",
  "pos-lux29": "AltabPOS/4.1 (iPadOS 18; LUX29-tablette)",
  "eshop-front": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/605.1",
  backoffice: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0",
  "stripe-webhook": "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
};

function pick<T>(items: readonly T[], serial: number): T {
  return items[serial % items.length]!;
}

function orderBody(serial: number): JsonValue {
  const size = pick(SIZES, serial);
  return {
    customerId: `cus_${(serial * 7919).toString(HEX)}`,
    lines: [
      {
        sku: `${ARTICLE}-${size}`,
        label: "Tamaris Bottine Alma",
        qty: 1,
        unitPrice: 89.95,
      },
      ...(serial % 3 === 0
        ? [
            {
              sku: "CARE-SPRAY-200",
              label: "Spray imperméabilisant",
              qty: 1,
              unitPrice: 9.5,
            },
          ]
        : []),
    ],
    shipping: {
      method: serial % 2 ? "pickup" : "home",
      store: pick(STORES, serial),
    },
    coupon: serial % 5 === 0 ? "AUTOMNE10" : null,
  };
}

function transferBody(serial: number): JsonValue {
  return [
    {
      sku: `${ARTICLE}-${pick(SIZES, serial)}`,
      from: "ENT",
      to: pick(STORES, serial + 1),
      qty: 2,
    },
    {
      sku: `${ARTICLE}-${pick(SIZES, serial + 2)}`,
      from: "ENT",
      to: pick(STORES, serial + 1),
      qty: 1,
    },
  ];
}

const ROUTES: RouteTemplate[] = [
  {
    method: "GET",
    path: (serial) => `/api/orders?status=paid&page=${(serial % 4) + 1}`,
    body: () => null,
    sql: "SELECT o.id, o.total, c.email\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nWHERE o.status = 'paid'\nORDER BY o.created_at DESC\nLIMIT 50 OFFSET 50;",
    statuses: [200, 200, 200, 304, 401],
  },
  {
    method: "POST",
    path: () => "/api/orders",
    body: orderBody,
    sql: "INSERT INTO orders (customer_id, store, total)\nVALUES ($1, $2, $3)\nRETURNING id;",
    statuses: [201, 201, 201, 422, 409],
  },
  {
    method: "PATCH",
    path: (serial) => `/api/orders/ord_${4100 + serial}`,
    body: (serial) => ({
      status: pick(["shipped", "ready_for_pickup", "cancelled"], serial),
    }),
    sql: "UPDATE orders\nSET status = $2, updated_at = now()\nWHERE id = $1;",
    statuses: [200, 200, 404, 409],
  },
  {
    method: "GET",
    path: (serial) =>
      `/api/stock/levels?article=${ARTICLE}&store=${pick(STORES, serial)}`,
    body: () => null,
    sql: "SELECT size, quantity, min_quantity\nFROM stock_levels\nWHERE article = $1 AND store = $2\nORDER BY size;",
    statuses: [200, 200, 200, 200, 500],
  },
  {
    method: "POST",
    path: () => "/api/stock/transfers",
    body: transferBody,
    sql: "INSERT INTO stock_transfers (sku, from_store, to_store, qty)\nSELECT * FROM jsonb_to_recordset($1)\n  AS t(sku text, from_store text, to_store text, qty int);",
    statuses: [201, 201, 422, 503],
  },
  {
    method: "PUT",
    path: (serial) => `/api/customers/cus_${(serial * 7919).toString(HEX)}`,
    body: (serial) => ({
      firstName: pick(
        ["Charlotte", "Julie", "Mehdi", "Sophie", "Inès"],
        serial,
      ),
      lastName: pick(
        ["Hubert", "Lambert", "Bensaïd", "Dubois", "Moreau"],
        serial,
      ),
      newsletter: serial % 2 === 0,
      tags: ["fidélité", pick(["vip", "eshop", "magasin"], serial)],
    }),
    sql: "UPDATE customers\nSET first_name = $2, last_name = $3, newsletter = $4\nWHERE id = $1;",
    statuses: [200, 200, 400, 404],
  },
  {
    method: "DELETE",
    path: (serial) =>
      `/api/customers/cus_${(serial * 7919).toString(HEX)}/addresses/${serial % 3}`,
    body: () => null,
    sql: "DELETE FROM customer_addresses\nWHERE customer_id = $1 AND position = $2;",
    statuses: [204, 204, 404],
  },
  {
    method: "POST",
    path: () => "/api/webhooks/stripe",
    body: (serial) => ({
      id: `evt_${(serial * 104729).toString(HEX)}`,
      type: pick(
        [
          "payment_intent.succeeded",
          "charge.refunded",
          "charge.dispute.created",
        ],
        serial,
      ),
      data: { object: { amount: 8995 + (serial % 3) * 950, currency: "eur" } },
    }),
    sql: "INSERT INTO payment_events (provider_id, type, payload)\nVALUES ($1, $2, $3)\nON CONFLICT (provider_id) DO NOTHING;",
    statuses: [200, 200, 200, 400],
  },
  {
    method: "GET",
    path: () => "/api/health",
    body: () => null,
    sql: "SELECT 1;",
    statuses: [200, 200, 200, 200, 503],
  },
  {
    method: "GET",
    path: (serial) =>
      `/api/reports/sales?from=2026-10-${String((serial % 20) + 1).padStart(2, "0")}&store=${pick(STORES, serial)}`,
    body: () => null,
    sql: "SELECT date_trunc('day', created_at) AS day, sum(total) AS revenue\nFROM orders\nWHERE store = $1 AND created_at >= $2\nGROUP BY 1\nORDER BY 1;",
    statuses: [200, 200, TIMEOUT_STATUS, SERVER_ERROR],
  },
];

const LONG_NOTES = [
  "Incident INC-2291 (24/10): la base de reporting a saturé pendant la clôture du mois.\nLa requête a été relancée à la main par Antony après l'ajout de l'index sur orders(created_at).\nÀ surveiller lors de la prochaine clôture : si le temps dépasse encore 30 s, passer le rapport en tâche de fond.",
  "Le terminal de caisse a renvoyé trois fois la même commande après une coupure Wi-Fi.\nLes doublons ont été annulés côté back-office ; le client n'a été débité qu'une fois (vérifié dans Stripe).",
  "Webhook Stripe reçu avant la création de la commande (course entre l'e-shop et le paiement).\nRejoué automatiquement 2 minutes plus tard, sans perte.",
];

const SHORT_NOTES = [
  "Relancé par le client",
  "Vérifié avec le magasin",
  "Doublon ignoré",
  "Ticket support #8812",
];

function noteFor(status: number, random: () => number): string | null {
  if (status >= SERVER_ERROR)
    return pick(LONG_NOTES, Math.floor(random() * HEX));
  if (random() < NOTE_RATIO)
    return pick(SHORT_NOTES, Math.floor(random() * HEX));
  return null;
}

function durationFor(status: number, random: () => number): number | null {
  if (status === TIMEOUT_STATUS) return null;
  const spread =
    random() < SLOW_RATIO ? MAX_DURATION_MS : TYPICAL_DURATION_SPREAD_MS;
  return Math.round(MIN_DURATION_MS + random() * spread);
}

function headersFor(
  route: RouteTemplate,
  client: string | null,
  serial: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-request-id": `rq-${(serial * 2654435761).toString(HEX).slice(-8)}`,
  };
  if (client) headers["user-agent"] = USER_AGENTS[client] ?? "curl/8.9.1";
  if (route.method !== "GET" && route.method !== "DELETE")
    headers["content-type"] = "application/json";
  if (client?.startsWith("pos-"))
    headers["x-store"] = client.slice("pos-".length).toUpperCase();
  return headers;
}

function labelsFor(durationMs: number | null, random: () => number): string[] {
  const labels: string[] = [];
  if (durationMs === null || durationMs > SLOW_MS) labels.push("slow");
  if (random() < LABEL_RATIO)
    labels.push(pick(REQUEST_LABELS.slice(1), Math.floor(random() * HEX)));
  return labels;
}

function objectId(serial: number, at: number): string {
  const seconds = Math.floor(at / SECONDS_MS).toString(HEX);
  return `${seconds}${OBJECT_ID_MACHINE}${(OBJECT_ID_COUNTER + serial).toString(HEX)}`;
}

function buildDocument(serial: number, random: () => number): RequestDocument {
  const route = pick(ROUTES, Math.floor(random() * ROUTES.length));
  const status = pick(
    route.statuses,
    Math.floor(random() * route.statuses.length),
  );
  const at = LOG_END - (DOCUMENT_COUNT - serial) * STEP_MINUTES * MINUTE_MS;
  const client = pick(CLIENTS, Math.floor(random() * CLIENTS.length));
  const durationMs = durationFor(status, random);
  return {
    _id: objectId(serial, at),
    ref: `req-${String(serial).padStart(REF_DIGITS, "0")}`,
    method: route.method,
    path: route.path(serial),
    status,
    durationMs,
    cached: route.method === "GET" && random() < CACHED_RATIO,
    receivedAt: new Date(at).toISOString(),
    client,
    headers: headersFor(route, client, serial),
    body: route.body(serial),
    sql: route.sql,
    labels: labelsFor(durationMs, random),
    notes: noteFor(status, random),
  };
}

function seedDocuments(): RequestDocument[] {
  const random = seededRandom(SEED);
  return Array.from({ length: DOCUMENT_COUNT }, (_, index) =>
    buildDocument(DOCUMENT_COUNT - index, random),
  );
}

/** The collection, newest first, kept in memory: a restart seeds it again. */
export const REQUEST_DOCUMENTS: RequestDocument[] = seedDocuments();

/**
 * The document the retention job "purged" after the grid read it: still
 * listed, but any save on it answers that the row is gone.
 */
export const PURGED_REF = "req-0297";
