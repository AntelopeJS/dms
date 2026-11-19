import type {
  BadgeItem,
  ColumnDisplay,
  DataTypeValue,
  DisplayTone,
  FieldSpec,
  MappedResource,
  ProposedCategory,
  TabsChoice,
} from "@antelopejs/interface-dms-builder";
import { badgeItems } from "@antelopejs/interface-dms/base/internal/column-badges";
import { refuse } from "./mapping-refusal";
import { words } from "./name-words";
import { isCurrencyCode, type PriceCurrency } from "./price-currency";
import { isPlainObject } from "./plain-object";

const BADGE_MIN_VALUES = 2;
const BADGE_MAX_VALUES = 10;
const TABS_MAX_VALUES = 6;

const TONES: ReadonlySet<string> = new Set<DisplayTone>([
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
]);

/** A number column whose name ends in one of these words is an amount (D2). */
const MONEY_WORDS: ReadonlySet<string> = new Set([
  "total",
  "amount",
  "price",
  "cost",
  "revenue",
  "subtotal",
]);

/** A column named by one of these words is the one a table is tabbed by (T1). */
const STATUS_WORDS: ReadonlySet<string> = new Set([
  "status",
  "state",
  "stage",
  "type",
]);

const PRICE = "price";
const SELECT = "select";
const BADGE_DECLARATION = "string";
const PRICE_DECLARATION = "number";

/** What a display rule reads about a column. */
export interface DisplayFacts {
  column: string;
  declared: string;
  isRelation: boolean;
  enumLike: boolean;
  categories?: ProposedCategory[];
  nulls?: number;
  /** The rows the profile was measured on. */
  rows?: number;
  /** The ISO 4217 code the database states for an amount column, when it does. */
  currency?: string;
}

/** A display a rule chose, and the rule. */
export interface ChosenDisplay {
  display: ColumnDisplay;
  rule: "D1" | "D2";
}

/** Whether a value is text, as a JSON body or a profile holds it. */
function isText(value: unknown): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function stringValues(categories: ProposedCategory[]): string[] | undefined {
  const values = categories.map((category) => category.value);
  return values.every(isText) ? values : undefined;
}

/**
 * The badge of the values a profile counts in a column, the most frequent
 * first; none when one is not text.
 */
export function profiledBadge(
  categories: ProposedCategory[],
): BadgeItem[] | undefined {
  const values = stringValues(
    [...categories].sort((left, right) => right.rows - left.rows),
  );
  return values && badgeItems(values);
}

/**
 * A badge when every non-null row falls in a category: the profile drops the categories it counts
 * too rarely, so a gap between their rows and the rows means a value would show unmatched.
 */
function proposeBadge(facts: DisplayFacts): ColumnDisplay | undefined {
  const { categories, rows } = facts;
  if (
    !facts.enumLike ||
    facts.declared !== BADGE_DECLARATION ||
    facts.isRelation ||
    !categories ||
    rows === undefined ||
    categories.length < BADGE_MIN_VALUES ||
    categories.length > BADGE_MAX_VALUES
  ) {
    return undefined;
  }
  const covered = categories.reduce((sum, category) => sum + category.rows, 0);
  const items = profiledBadge(categories);
  return items && covered === rows - (facts.nulls ?? 0)
    ? { kind: "badge", items }
    : undefined;
}

/** Whether the name's last word says money: `unit_price`, `unitPrice`, `total`, not `total_items`. */
export function isMoneyName(column: string): boolean {
  const last = words(column).at(-1);
  return last !== undefined && MONEY_WORDS.has(last);
}

function priceDisplay(currency: string | undefined): ColumnDisplay {
  return currency ? { kind: PRICE, currency } : { kind: PRICE };
}

/** The display the data calls for: a badge (D1) or a price (D2), else none. */
export function proposeDisplay(facts: DisplayFacts): ChosenDisplay | undefined {
  const badge = proposeBadge(facts);
  if (badge) {
    return { display: badge, rule: "D1" };
  }
  return facts.declared === PRICE_DECLARATION &&
    !facts.isRelation &&
    isMoneyName(facts.column)
    ? { display: priceDisplay(facts.currency), rule: "D2" }
    : undefined;
}

/** A column that may carry the tabs, with the display it is proposed. */
export interface TabCandidate {
  column: string;
  display?: ColumnDisplay;
  filterable: boolean;
}

/**
 * The column to tab a TableView by (T1): of the filterable badge columns of two to six values, the
 * first named like a status, else the one with the fewest values.
 */
export function proposeTabs(
  candidates: TabCandidate[],
): TabsChoice | undefined {
  const sized = candidates.flatMap((candidate) =>
    candidate.filterable && candidate.display?.kind === "badge"
      ? [{ column: candidate.column, size: candidate.display.items.length }]
      : [],
  );
  const eligible = sized.filter(
    (entry) => entry.size >= BADGE_MIN_VALUES && entry.size <= TABS_MAX_VALUES,
  );
  const named = eligible.find((entry) =>
    words(entry.column).some((word) => STATUS_WORDS.has(word)),
  );
  const fewest = eligible.reduce<(typeof eligible)[number] | undefined>(
    (best, entry) => (best && best.size <= entry.size ? best : entry),
    undefined,
  );
  const chosen = named ?? fewest;
  return chosen ? { column: chosen.column } : undefined;
}

/** Why a display cannot be written on a column of this declaration, if it cannot. */
export function displayRefusal(
  display: ColumnDisplay,
  declared: string,
): string | undefined {
  if (display.kind === PRICE) {
    if (display.currency !== undefined && !isCurrencyCode(display.currency)) {
      return `the price currency ${JSON.stringify(display.currency)} is not an ISO 4217 code such as USD`;
    }
    return declared === PRICE_DECLARATION
      ? undefined
      : `a price display needs a ${PRICE_DECLARATION} column, not ${declared}`;
  }
  if (display.kind !== "badge") {
    return `unknown display ${JSON.stringify(display)}`;
  }
  return declared === BADGE_DECLARATION
    ? undefined
    : `a badge display needs a ${BADGE_DECLARATION} column, not ${declared}`;
}

/**
 * The DataType a display writes on the controller's field `column`: a badge
 * reads its items from the column's rows when the page is served, and a price
 * writes the currency `currency` says. No value of a row is written.
 */
export function displayDataType(
  display: ColumnDisplay,
  column: string,
  currency: PriceCurrency,
): DataTypeValue {
  if (display.kind === PRICE) {
    return currency
      ? { $dataType: PRICE, config: { ...currency } }
      : { $dataType: PRICE };
  }
  return { $dataType: SELECT, config: { items: [], itemsFrom: { column } } };
}

function isTone(value: unknown): value is DisplayTone {
  return isText(value) && TONES.has(value);
}

/** An item of a select's config as the controller's code holds it, or whatever else it holds. */
interface StoredItem {
  value?: unknown;
  label?: unknown;
  textColor?: unknown;
}

function badgeItemOf(entry: StoredItem | null): BadgeItem | undefined {
  const { value, label, textColor } = entry ?? {};
  return isText(value) && isText(label) && isTone(textColor)
    ? { value, label, tone: textColor }
    : undefined;
}

/** Whether a DataType's config reads its select items from the column it names. */
function readsItemsFrom(config: DataTypeValue["config"]): boolean {
  const itemsFrom = config?.itemsFrom;
  return isPlainObject(itemsFrom) && isText(itemsFrom.column);
}

/**
 * The display a controller field's DataType was written from, when it is one this module writes:
 * a badge reading its items from the rows answers no item, a price reading its currency from them
 * no currency. A badge or a currency written as values, by a mapping before them, reads back as
 * written.
 */
export function displayOfDataType(
  dataType: DataTypeValue | undefined,
): ColumnDisplay | undefined {
  if (dataType?.$dataType === PRICE) {
    const currency: unknown = dataType.config?.currency;
    return priceDisplay(isCurrencyCode(currency) ? currency : undefined);
  }
  if (dataType?.$dataType !== SELECT) {
    return undefined;
  }
  if (readsItemsFrom(dataType.config)) {
    return { kind: "badge", items: [] };
  }
  const items: unknown = dataType.config?.items;
  if (!Array.isArray(items)) {
    return undefined;
  }
  const badges = items.map(badgeItemOf);
  return badges.length > 0 && badges.every((item) => item !== undefined)
    ? { kind: "badge", items: badges }
    : undefined;
}

/** Whether a default display may be written on a column of this declaration. */
export function suits(display: ColumnDisplay, declared: string): boolean {
  return displayRefusal(display, declared) === undefined;
}

/** What the tabs of a relation's TableView are planned from. */
export interface TabsPlanning {
  resource: MappedResource;
  where: string;
  apiFields: FieldSpec[];
  displays: ReadonlyMap<string, ColumnDisplay>;
  /** Whether the relation was not mapped before, so the rules propose its tabs. */
  proposed: boolean;
  /** The column of the tabs the mapping wrote on its page before, when it was mapped. */
  kept?: TabsChoice;
}

/**
 * The column a TableView's tabs read from the rows: a badge column the controller shows and
 * filters. Tabs left out are proposed (T1) for a relation not mapped before, from the displays its
 * columns are drawn with, and a relation mapped before keeps the column of the tabs its mapping
 * wrote. Tabs of null write none.
 */
export function plannedTabs(planning: TabsPlanning): TabsChoice | undefined {
  const { resource, where, apiFields, displays } = planning;
  if (!resource.tableView || resource.tabs === null) {
    return undefined;
  }
  const chosen =
    resource.tabs ??
    (planning.proposed
      ? proposeTabs(
          apiFields.map((spec) => ({
            column: spec.name,
            display: displays.get(spec.name),
            filterable: spec.filterable === true,
          })),
        )
      : planning.kept);
  if (chosen === undefined) {
    return undefined;
  }
  const shown = apiFields.find((spec) => spec.name === chosen.column);
  if (!shown?.filterable || displays.get(chosen.column)?.kind !== "badge") {
    refuse(
      `tabs by ${where}.${chosen.column} need a column the TableView shows and filters, with a badge display`,
    );
  }
  return { column: chosen.column };
}
