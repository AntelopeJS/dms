import { z } from "zod";
import type { Json, JsonObject, MockupName } from "./model";

/** The key of a fixture value that asks the server for rows. */
export const GENERATE_KEY = "$generate";

/** How many rows a `$generate` fixture holds when it names no count. */
export const DEFAULT_GENERATED_ROWS = 8;
/** How many rows a `$generate` fixture holds at most. */
export const MAX_GENERATED_ROWS = 200;

/** The kinds of value a field names by a string. */
export const GENERATE_KINDS = [
  "id",
  "name",
  "email",
  "company",
  "city",
  "text",
  "date",
  "boolean",
] as const;

type NamedKind = (typeof GENERATE_KINDS)[number];

/** The message of a field whose kind is none of the shapes {@link GENERATE_KINDS} and its siblings list. */
export const KIND_MESSAGE = `a kind is one of ${GENERATE_KINDS.map((kind) => `"${kind}"`).join(", ")}, { "number": [min, max] }, { "money": [min, max] }, or a non-empty array of strings to pick from`;

const rangeSchema = z.tuple([z.number().finite(), z.number().finite()]);

type Range = [number, number];

/** What a field's kind asks for, once read. */
type Kind =
  | { kind: "named"; name: NamedKind }
  | { kind: "number"; range: Range }
  | { kind: "money"; range: Range }
  | { kind: "pick"; items: string[] };

const writtenKind = z.union([
  z.enum(GENERATE_KINDS).transform((name): Kind => ({ kind: "named", name })),
  z
    .object({ number: rangeSchema })
    .strict()
    .transform(({ number }): Kind => ({ kind: "number", range: number })),
  z
    .object({ money: rangeSchema })
    .strict()
    .transform(({ money }): Kind => ({ kind: "money", range: money })),
  z
    .array(z.string())
    .nonempty()
    .transform((items): Kind => ({ kind: "pick", items })),
]);

/**
 * A field's kind. A value of none of the shapes is refused with
 * {@link KIND_MESSAGE}, a range the wrong way round with its own.
 */
const kindSchema = z.unknown().transform((value, context): Kind => {
  const read = writtenKind.safeParse(value);
  if (!read.success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: KIND_MESSAGE });
    return z.NEVER;
  }
  const { data } = read;
  if (
    (data.kind === "number" || data.kind === "money") &&
    data.range[0] > data.range[1]
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "the minimum must not exceed the maximum",
    });
    return z.NEVER;
  }
  return data;
});

const generateSchema = z
  .object({
    rows: z.number().int().min(1).max(MAX_GENERATED_ROWS).optional(),
    fields: z
      .record(z.string().min(1), kindSchema)
      .refine((fields) => Object.keys(fields).length > 0, {
        message: "a generated row needs at least one field",
      }),
  })
  .strict();

/** A fixture value `{ "$generate": { rows?, fields } }`: rows the server makes up. */
export const generatedFixtureSchema = z
  .object({ [GENERATE_KEY]: generateSchema })
  .strict();

const objectSchema = z.record(z.unknown());

/** Whether `value` is an object that holds {@link GENERATE_KEY}, well-formed or not. */
export function holdsGenerate(value: Json): boolean {
  const object = objectSchema.safeParse(value);
  return object.success && Object.hasOwn(object.data, GENERATE_KEY);
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_STEP = 0x6d2b79f5;
const UNIT = 2 ** 32;
const SEED_SEPARATOR = "\u0000";

/** A generator of numbers in [0, 1) that the same parts always seed the same. */
function randomOf(...parts: string[]): () => number {
  let hash = FNV_OFFSET;
  for (const char of parts.join(SEED_SEPARATOR)) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + MULBERRY_STEP) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UNIT;
  };
}

type Random = () => number;

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

const FIRST_NAMES = [
  "Ada",
  "Alma",
  "Bruno",
  "Chloé",
  "Dario",
  "Elena",
  "Farid",
  "Greta",
  "Hugo",
  "Ines",
  "Jonas",
  "Kenji",
  "Lena",
  "Marco",
  "Nadia",
  "Omar",
  "Priya",
  "Quentin",
  "Rosa",
  "Samir",
  "Tess",
  "Viktor",
];

const LAST_NAMES = [
  "Adler",
  "Bauer",
  "Castro",
  "Dupont",
  "Eriksen",
  "Fontaine",
  "Garcia",
  "Haddad",
  "Ivanov",
  "Jensen",
  "Keller",
  "Lambert",
  "Moreau",
  "Novak",
  "Okafor",
  "Petit",
  "Rossi",
  "Silva",
  "Tanaka",
  "Weber",
];

const COMPANY_STEMS = [
  "Acme",
  "Brightline",
  "Corvid",
  "Delta",
  "Evergreen",
  "Foxglove",
  "Granite",
  "Harbor",
  "Ironwood",
  "Juniper",
  "Kestrel",
  "Lumen",
  "Meridian",
  "Northwind",
];

const COMPANY_SUFFIXES = [
  "Logistics",
  "Foods",
  "Studio",
  "Marine",
  "Supply",
  "Labs",
  "Systems",
  "Partners",
  "Works",
  "Group",
];

const CITIES = [
  "Amsterdam",
  "Berlin",
  "Brussels",
  "Dublin",
  "Lisbon",
  "Lyon",
  "Madrid",
  "Milan",
  "Oslo",
  "Paris",
  "Prague",
  "Rotterdam",
  "Turin",
  "Vienna",
  "Warsaw",
  "Zurich",
];

const WORDS = [
  "order",
  "delivery",
  "customer",
  "invoice",
  "review",
  "pending",
  "updated",
  "shipment",
  "contract",
  "renewal",
  "support",
  "request",
  "account",
  "payment",
  "schedule",
  "approved",
  "report",
  "follow-up",
  "quote",
  "team",
];

const MIN_WORDS = 4;
const EXTRA_WORDS = 5;

const DAY_MS = 86_400_000;

/** How many days back from today a generated date reaches. */
export const DATE_SPAN_DAYS = 30;
const BOOLEAN_ODDS = 0.5;

/** The current time in milliseconds since the epoch; tests pass their own. */
export type Clock = () => number;

/** The start of the UTC day of `time`: the anchor a generated date counts back from, so a day's loads agree. */
export function startOfDay(time: number): number {
  return time - (time % DAY_MS);
}

const NAMED: Record<
  NamedKind,
  (random: Random, row: number, person: Person, today: number) => Json
> = {
  id: (_random, row) => `r${row + 1}`,
  name: (_random, _row, person) => `${person.first} ${person.last}`,
  email: (_random, _row, person) =>
    `${person.first}.${person.last}@example.com`
      .normalize("NFD")
      .replaceAll(/[̀-ͯ]/g, "")
      .toLowerCase(),
  company: (random) =>
    `${pick(random, COMPANY_STEMS)} ${pick(random, COMPANY_SUFFIXES)}`,
  city: (random) => pick(random, CITIES),
  text: (random) => {
    const count = MIN_WORDS + Math.floor(random() * EXTRA_WORDS);
    const words = Array.from({ length: count }, () => pick(random, WORDS));
    return `${words.join(" ").replace(/^./, (first) => first.toUpperCase())}.`;
  },
  date: (random, _row, _person, today) =>
    new Date(
      today - Math.floor(random() * DATE_SPAN_DAYS * DAY_MS),
    ).toISOString(),
  boolean: (random) => random() < BOOLEAN_ODDS,
};

interface Person {
  first: string;
  last: string;
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function between(random: Random, [min, max]: Range): number {
  return min + random() * (max - min);
}

function valueOf(
  kind: Kind,
  random: Random,
  row: number,
  person: Person,
  today: number,
): Json {
  switch (kind.kind) {
    case "named":
      return NAMED[kind.name](random, row, person, today);
    case "pick":
      return pick(random, kind.items);
    case "money":
      return roundTo(between(random, kind.range), 2);
    case "number": {
      const [min, max] = kind.range;
      return Number.isInteger(min) && Number.isInteger(max)
        ? Math.floor(between(random, [min, max + 1]))
        : roundTo(between(random, kind.range), 2);
    }
  }
}

function rowOf(
  seed: string,
  index: number,
  fields: Record<string, Kind>,
  today: number,
): JsonObject {
  const person = {
    first: pick(randomOf(seed, "person", String(index), "first"), FIRST_NAMES),
    last: pick(randomOf(seed, "person", String(index), "last"), LAST_NAMES),
  };
  return Object.fromEntries(
    Object.entries(fields).map(([field, kind]) => [
      field,
      valueOf(kind, randomOf(seed, field, String(index)), index, person, today),
    ]),
  );
}

/**
 * The rows a `$generate` fixture stands for. Each value comes from the
 * fixture's `seed`, its field and its row alone, so the same spec always
 * yields the same rows, and adding a field leaves the others as they were.
 * Only a `date` also reads `now`: it falls within the last
 * {@link DATE_SPAN_DAYS} days before the start of `now`'s UTC day, so a view
 * of recent rows is never empty and a day's loads agree.
 * Undefined when `value` is not a well-formed `$generate` fixture.
 */
export function generateRows(
  value: Json,
  seed: string,
  now: number,
): JsonObject[] | undefined {
  const parsed = generatedFixtureSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { rows = DEFAULT_GENERATED_ROWS, fields } = parsed.data[GENERATE_KEY];
  const today = startOfDay(now);
  return Array.from({ length: rows }, (_, index) =>
    rowOf(seed, index, fields, today),
  );
}

/**
 * `fixtures` with every `$generate` value replaced by its rows, seeded by
 * the mockup, the page and the fixture key. The one place a fixture a spec
 * writes becomes the value its routes answer.
 */
export function materializeFixtures(
  name: MockupName,
  pageId: string,
  fixtures: JsonObject,
  now: number,
): JsonObject {
  return Object.fromEntries(
    Object.entries(fixtures).map(([key, value]) => [
      key,
      generateRows(value, `${name}/${pageId}/${key}`, now) ?? value,
    ]),
  );
}
