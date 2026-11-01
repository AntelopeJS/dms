import {
  helioCustomerRecord,
  helioCustomers,
  HELIO_DOCUMENTS,
  helioMonitoringSettings,
  HELIO_MEMBER_EMAILS,
  helioMonitoringEvents,
  helioProjects,
  helioProjectTasks,
  type FixtureRow,
  type FixtureValue,
} from "./helio";

/**
 * Where the documentation examples read and write their rows: routes of the
 * frontend server, so an example needs no data in the backend.
 */
export const DOCS_FIXTURES_PREFIX = "/docs-fixtures/";

/** A request as the table and form blocks send it. */
export interface FixtureRequest {
  method: string;
  /** The path under {@link DOCS_FIXTURES_PREFIX}, e.g. `projects/list`. */
  path: string;
  query: URLSearchParams;
  body?: FixtureValue;
}

/** What a fixture route answers. */
export interface FixtureAnswer {
  status: number;
  body: FixtureValue;
}

/** A dataset, and the footer figures its `summary` route computes. */
interface Dataset {
  rows: () => FixtureRow[];
  summaries?: Record<string, (rows: FixtureRow[]) => number>;
}

const sumOf =
  (field: string) =>
  (rows: FixtureRow[]): number =>
    Math.round(
      rows.reduce((total, row) => {
        const value = row[field];
        return total + (Number.isFinite(value) ? Number(value) : 0);
      }, 0) * 10,
    ) / 10;

const DATASETS = new Map<string, Dataset>([
  [
    "projects",
    {
      rows: helioProjects,
      summaries: {
        capacity: sumOf("capacityKwp"),
        budget: sumOf("budget"),
        onHold: (rows) => rows.filter((row) => row.status === "on_hold").length,
      },
    },
  ],
  ["tasks", { rows: helioProjectTasks }],
  ["events", { rows: helioMonitoringEvents }],
  ["customers", { rows: helioCustomers }],
  ["account", { rows: () => [helioCustomerRecord()] }],
  ["settings", { rows: () => [helioMonitoringSettings()] }],
  ["invitations", { rows: () => [] }],
  ["empty", { rows: () => [] }],
]);

const FILTER_PREFIX = "filter_";
/** Query flag of a bulk write covering every row the filters match. */
const ALL_MATCHING_KEY = "allMatching";
/** The value a demo form refuses, to show a failed save. */
const REFUSED_VALUE = "fail";

const textOf = (value: FixtureValue | undefined): string =>
  value === null || value === undefined
    ? ""
    : JSON.stringify(value).replace(/^"|"$/g, "");

const isNumeric = (text: string): boolean =>
  text !== "" && Number.isFinite(Number(text));

/** Orders two values as numbers when both are, else as text, which orders ISO dates. */
function compareText(left: string, right: string): number {
  return isNumeric(left) && isNumeric(right)
    ? Number(left) - Number(right)
    : left.localeCompare(right);
}

/**
 * How a field value orders against a filter value; a date-only filter value
 * compares with the day of a timestamp.
 */
function order(actual: string, wanted: string): number {
  return isNumeric(actual) && isNumeric(wanted)
    ? compareText(actual, wanted)
    : compareText(actual.slice(0, wanted.length), wanted);
}

/** Whether a row passes one `filter_<field>=<mode>:<value>` of the list query. */
function passes(row: FixtureRow, field: string, filter: string): boolean {
  const separator = filter.indexOf(":");
  const mode = separator < 0 ? filter : filter.slice(0, separator);
  const wanted = separator < 0 ? "" : filter.slice(separator + 1);
  const actual = textOf(row[field]);
  const [from = "", to = ""] = wanted.split(",");
  const tests = new Map<string, () => boolean>([
    [
      "is",
      () =>
        wanted
          .split(",")
          .some(
            (value) => order(actual, value) === 0 && actual.startsWith(value),
          ),
    ],
    [
      "is_not",
      () =>
        !wanted
          .split(",")
          .some(
            (value) => actual.startsWith(value) && order(actual, value) === 0,
          ),
    ],
    ["contains", () => actual.toLowerCase().includes(wanted.toLowerCase())],
    [
      "not_contains",
      () => !actual.toLowerCase().includes(wanted.toLowerCase()),
    ],
    ["is_empty", () => actual === ""],
    ["is_not_empty", () => actual !== ""],
    ["greater_than", () => order(actual, wanted) > 0],
    ["greater_than_or_equal_to", () => order(actual, wanted) >= 0],
    ["less_than", () => order(actual, wanted) < 0],
    ["less_than_or_equal_to", () => order(actual, wanted) <= 0],
    ["is_between", () => order(actual, from) >= 0 && order(actual, to) <= 0],
  ]);
  return tests.get(mode)?.() ?? true;
}

function compareRows(field: string, descending: boolean) {
  const direction = descending ? -1 : 1;
  return (left: FixtureRow, right: FixtureRow): number => {
    const a = textOf(left[field]);
    const b = textOf(right[field]);
    return compareText(a, b) * direction;
  };
}

/** The rows a list query names: filtered, searched and sorted, not paged. */
function matching(rows: FixtureRow[], query: URLSearchParams): FixtureRow[] {
  let result = rows;
  for (const [key, value] of query) {
    if (!key.startsWith(FILTER_PREFIX)) continue;
    const field = key.slice(FILTER_PREFIX.length);
    result = result.filter((row) => passes(row, field, value));
  }
  const search = query.get("search")?.trim().toLowerCase();
  if (search) {
    result = result.filter((row) =>
      Object.values(row).some((value) =>
        textOf(value).toLowerCase().includes(search),
      ),
    );
  }
  const sortKey = query.get("sortKey");
  if (sortKey) {
    result = [...result].sort(
      compareRows(sortKey, query.get("sortDirection") === "desc"),
    );
  }
  return result;
}

function listAnswer(rows: FixtureRow[], query: URLSearchParams): FixtureAnswer {
  const found = matching(rows, query);
  const offset = Number(query.get("offset")) || 0;
  const limit = Number(query.get("limit")) || found.length;
  return {
    status: 200,
    body: {
      results: found.slice(offset, offset + limit),
      total: found.length,
      offset,
      limit,
    },
  };
}

/** A `{ message, field }` refusal for the first field set to {@link REFUSED_VALUE}. */
function refusal(body: FixtureValue | undefined): FixtureAnswer | undefined {
  const fields = fieldsOf(body);
  const field = Object.keys(fields).find(
    (key) => fields[key] === REFUSED_VALUE,
  );
  return field
    ? {
        status: 400,
        body: {
          message: `"${REFUSED_VALUE}" is refused by the demo route.`,
          field,
        },
      }
    : undefined;
}

/** Whether a JSON value is an object of named fields. */
const isFields = (
  value: FixtureValue | undefined,
): value is { [key: string]: FixtureValue } =>
  Object.prototype.toString.call(value) === "[object Object]";

/** The named fields of a request body, none when it is not a JSON object. */
const fieldsOf = (
  body: FixtureValue | undefined,
): Record<string, FixtureValue> => (isFields(body) ? body : {});

/** The ids a write names, as `id` (a single row) or repeated `ids` (a selection). */
const idsOf = (query: URLSearchParams): string[] =>
  [...query.getAll("id"), ...query.getAll("ids")].flatMap((id) =>
    id.split(","),
  );

/** How many rows a write covers: every matching row after "Select all N matching". */
const writtenCount = (rows: FixtureRow[], query: URLSearchParams): number =>
  query.get(ALL_MATCHING_KEY) === "true"
    ? matching(rows, query).length
    : idsOf(query).length;

function countBatch(
  rows: FixtureRow[],
  body: FixtureValue | undefined,
): FixtureAnswer {
  const queries = fieldsOf(body).queries;
  const totals: Record<string, number> = {};
  for (const entry of Array.isArray(queries) ? queries : []) {
    const { id, query } = fieldsOf(entry);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fieldsOf(query)))
      params.append(key, textOf(value));
    const key = textOf(id);
    if (key) totals[key] = matching(rows, params).length;
  }
  return { status: 200, body: totals };
}

function summary(
  rows: FixtureRow[],
  dataset: Dataset,
  query: URLSearchParams,
): FixtureAnswer {
  const found = matching(rows, query);
  const figures: Record<string, number> = {};
  for (const id of query.getAll("ids").flatMap((ids) => ids.split(","))) {
    const compute =
      dataset.summaries && Object.hasOwn(dataset.summaries, id)
        ? dataset.summaries[id]
        : undefined;
    if (compute) figures[id] = compute(found);
  }
  return { status: 200, body: figures };
}

/** The confirmation of a lowered retention, as the custom input demo asks it. */
function lowerRetention(query: URLSearchParams): FixtureAnswer {
  return {
    status: 200,
    body: {
      title: "Delete history older than {days} days?",
      description: "Older readings are deleted at the next save. Type delete.",
      params: { days: query.get("days") ?? "" },
      color: "error",
      icon: "i-ph-trash",
      confirmLabel: "Delete and save",
      confirmText: "DELETE",
      confirmTextCaseInsensitive: true,
    },
  };
}

/**
 * The confirmation a delete asks the route for: worded with the project's
 * code and what it removes, or blocked once the project is done.
 */
function deleteConfirm(
  rows: FixtureRow[],
  id: string | undefined,
): FixtureAnswer {
  const row = rows.find((candidate) => candidate._id === id);
  if (!row) return { status: 404, body: { message: "Not found" } };
  const code = textOf(row.code);
  if (row.status === "done") {
    return {
      status: 200,
      body: {
        title: `${code} is done`,
        description:
          "A finished installation stays on record for its warranty. Archive it instead.",
        icon: "i-ph-lock-simple",
        color: "warning",
        blocked: true,
      },
    };
  }
  return {
    status: 200,
    body: {
      title: `Delete ${code}?`,
      description: textOf(row.name),
      color: "error",
      confirmLabel: "Delete the project",
      impact: [
        { icon: "i-ph-list-checks", label: "Tasks", count: 7 },
        { icon: "i-ph-files", label: "Documents", count: 3 },
      ],
    },
  };
}

/**
 * An invitation as a module's action route answers it: a member already in
 * the workspace is skipped with a `warning`, anyone else gets a `notice`.
 */
function invite(fields: Record<string, FixtureValue>): FixtureAnswer {
  const email = textOf(fields.email).toLowerCase();
  if (HELIO_MEMBER_EMAILS.includes(email)) {
    return {
      status: 200,
      body: { sent: 0, warning: `${email} is already a member of Helio.` },
    };
  }
  return {
    status: 200,
    body: {
      sent: 1,
      notice: {
        title: "Invitation sent",
        description: email,
        color: "success",
      },
    },
  };
}

/**
 * A write as the route answers it, refusing a field set to
 * {@link REFUSED_VALUE}. Nothing is kept: the routes serve every visitor of
 * the docs, so the next read answers the fixed rows again.
 */
function write(
  name: string,
  rows: FixtureRow[],
  action: string,
  request: FixtureRequest,
): FixtureAnswer {
  const refused = refusal(request.body);
  if (refused) return refused;
  const fields = fieldsOf(request.body);
  if (action === "new")
    return {
      status: 200,
      body: { ...fields, _id: `${name}-${rows.length + 1}` },
    };
  if (action === "invite") return invite(fields);
  return { status: 200, body: { count: writtenCount(rows, request.query) } };
}

/**
 * Answers a request under {@link DOCS_FIXTURES_PREFIX} as a data controller or
 * a source route would: `<set>` or `<set>/list`, `<set>/get`, `<set>/rows/<id>`,
 * `<set>/count/batch`, `<set>/summary`, and writes (`new`, `edit`, `delete`,
 * any custom action), which keep nothing. `unavailable` always fails.
 */
export function answerDocsFixture(request: FixtureRequest): FixtureAnswer {
  const [name = "", action = "list", rowId] = request.path.split("/");
  if (name === "unavailable") {
    return {
      status: 503,
      body: { message: "The monitoring API did not answer." },
    };
  }
  if (request.path === "lower-retention") return lowerRetention(request.query);
  const fixed = HELIO_DOCUMENTS.get(request.path);
  if (fixed !== undefined) return { status: 200, body: fixed };
  const dataset = DATASETS.get(name);
  if (!dataset)
    return { status: 404, body: { message: `No docs fixture "${name}".` } };
  const rows = dataset.rows();
  const isRead = request.method === "GET";
  if (isRead && action === "list") return listAnswer(rows, request.query);
  if (isRead && (action === "get" || action === "rows")) {
    const id = rowId ?? request.query.get("id");
    const row = rows.find((candidate) => candidate._id === id);
    return row
      ? { status: 200, body: row }
      : { status: 404, body: { message: "Not found" } };
  }
  if (isRead && action === "confirm") return deleteConfirm(rows, rowId);
  if (isRead && action === "summary")
    return summary(rows, dataset, request.query);
  if (action === "count") return countBatch(rows, request.body);
  return write(name, rows, action, request);
}
