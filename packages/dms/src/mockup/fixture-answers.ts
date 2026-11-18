import {
  type BlockOptionSchema,
  type BlockTypeDescriptor,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import type { ChartSeries } from "@antelopejs/interface-dms/base/chart";
import type {
  ChartCardData,
  KpiCardData,
  SeriesPoint,
} from "@antelopejs/interface-dms/base/query-response";
import { z } from "zod";
import {
  type FixtureScope,
  fixtureKeyOf,
  fixtureSource,
  rowsReadOneByOne,
} from "./fixtures";
import type { Json, JsonObject, MockupIssue, MockupNode } from "./model";
import { jsonObjectSchema, jsonPointer, specValueAt } from "./model";

/** One key of the answer a block reads from its `fetchUrl`. */
interface AnswerKey {
  key: string;
  required: boolean;
  /** The value as written, for the message: `[{ x, y }]`. */
  expects: string;
  /** What is wrong with `value`, or undefined when the block reads it. */
  problem(value: Json): string | undefined;
}

/** What a block reads from its `fetchUrl`. */
interface BlockAnswer {
  /** The answer as written, for the message: `{ value, delta? }`. */
  expects: string;
  /** What is wrong with `answer`, one line each; none when the block reads it. */
  problems(answer: Json): string[];
}

const PREVIEW_LENGTH = 80;

/** `value` as JSON, cut to {@link PREVIEW_LENGTH} characters. */
function preview(value: Json): string {
  const text = JSON.stringify(value);
  return text.length > PREVIEW_LENGTH
    ? `${text.slice(0, PREVIEW_LENGTH)}…`
    : text;
}

function zodKey(
  key: string,
  schema: z.ZodTypeAny,
  expects: string,
  required = false,
): AnswerKey {
  return {
    key,
    required,
    expects,
    problem: (value) =>
      schema.safeParse(value).success
        ? undefined
        : `${key} must be ${expects}, got ${preview(value)}`,
  };
}

/** How the registry describes an option, written as a spec writes it. */
function written(schema: BlockOptionSchema): string {
  if (schema.type === "array" && schema.items) {
    return `[${written(schema.items)}]`;
  }
  if (!schema.properties) return schema.type;
  const keys = Object.entries(schema.properties).map(([key, property]) =>
    property.optional ? `${key}?` : key,
  );
  return `{ ${keys.join(", ")} }`;
}

const MAX_OPTION_ISSUES = 3;

/**
 * The answer's `key`, read as the block's own `option` is: checked by the
 * block's registered schema, so the two cannot drift apart.
 */
function optionKey(
  descriptor: BlockTypeDescriptor,
  key: string,
  option: string,
  required = true,
): AnswerKey {
  const schema = Object.hasOwn(descriptor.config, option)
    ? descriptor.config[option]
    : undefined;
  const expects = schema ? written(schema) : "a value";
  const at = `/${option}`;
  return {
    key,
    required,
    expects,
    problem(value) {
      const options = { [option]: value };
      const result = ValidateBlockOptions(descriptor.type, options);
      const issues = result.valid
        ? []
        : result.issues.filter(
            ({ pointer }) => pointer === at || pointer.startsWith(`${at}/`),
          );
      if (!issues.length) return undefined;
      const details = issues
        .slice(0, MAX_OPTION_ISSUES)
        .map(({ pointer, message }) => {
          const path = `${key}${pointer.slice(at.length)}`;
          return specValueAt(options, pointer) === undefined
            ? `${path} is missing`
            : `${path}: ${message}`;
        });
      return `${key} must be ${expects} (${details.join("; ")})`;
    },
  };
}

/** An object answer of `keys`; a key the block does not read is a problem too. */
function objectAnswer(keys: readonly AnswerKey[]): BlockAnswer {
  const expects = `{ ${keys.map(({ key, required }) => (required ? key : `${key}?`)).join(", ")} }`;
  const known = new Set(keys.map(({ key }) => key));
  const keyProblems = (object: JsonObject): string[] =>
    keys.flatMap((answerKey) => {
      const { key } = answerKey;
      if (Object.hasOwn(object, key))
        return answerKey.problem(object[key]) ?? [];
      return answerKey.required
        ? [`${key} is missing: it must be ${answerKey.expects}`]
        : [];
    });
  return {
    expects,
    problems(answer) {
      const object = jsonObjectSchema.safeParse(answer);
      if (!object.success) {
        return [`must be an object ${expects}, got ${preview(answer)}`];
      }
      const unread = Object.keys(object.data)
        .filter((key) => !known.has(key))
        .map((key) => `the block reads no "${key}": it reads ${expects}`);
      return [...keyProblems(object.data), ...unread];
    },
  };
}

/** A form's record: any object. */
const recordAnswer: BlockAnswer = {
  expects: "a record object",
  problems: (answer) =>
    jsonObjectSchema.safeParse(answer).success
      ? []
      : [`must be a record object, got ${preview(answer)}`],
};

const xSchema = z.union([z.string(), z.number()]);

const groupPointSchema = z.object({
  x: xSchema,
  y: z.number().nullable(),
}) satisfies z.ZodType<SeriesPoint>;

const seriesSchema = z.object({
  name: z.string(),
  data: z.array(
    z.union([
      z.number(),
      z.object({
        x: xSchema,
        y: z.number().nullable(),
        label: z.string().optional(),
      }),
      z.object({ x: xSchema, y: z.tuple([z.number(), z.number()]) }),
      z.object({
        x: xSchema,
        y: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      }),
    ]),
  ),
}) satisfies z.ZodType<Pick<ChartSeries, "name" | "data">>;

const SERIES = "[{ name, data: [{ x, y }] }]";

const seriesKey = zodKey(
  "series",
  z.union([z.array(seriesSchema), z.array(groupPointSchema)]),
  `${SERIES} or [{ x, y }]`,
  true,
);

const numberKey = (key: string, required = false) =>
  zodKey(key, z.number(), "a number", required);

const kpiAnswer = objectAnswer([
  numberKey("value", true),
  numberKey("delta"),
  numberKey("previousValue"),
  zodKey(
    "sparkline",
    z.array(z.number()) satisfies z.ZodType<KpiCardData["sparkline"]>,
    "[number]",
  ),
  zodKey("caption", z.string(), "a string"),
]);

const chartCardAnswer = objectAnswer([
  numberKey("value"),
  numberKey("delta"),
  numberKey("previousValue"),
  seriesKey,
  zodKey(
    "comparisonSeries",
    z.array(seriesSchema) satisfies z.ZodType<
      ChartCardData["comparisonSeries"]
    >,
    SERIES,
  ),
]);

const chartAnswer = objectAnswer([seriesKey]);

/**
 * What a block reads, by the answer its `fetchUrl` option declares in the
 * registry (`responseShape`): every chart reads `series`, a KPI card `value`,
 * a chart card `card`.
 */
const ANSWERS_BY_SOURCE = new Map<string, BlockAnswer>([
  ["value", kpiAnswer],
  ["card", chartCardAnswer],
  ["series", chartAnswer],
]);

/** A list block's answer, `{ items, count? }`: each item as its `items` option takes it. */
const listAnswer = (descriptor: BlockTypeDescriptor): BlockAnswer =>
  objectAnswer([optionKey(descriptor, "items", "items"), numberKey("count")]);

const METER_KEYS = ["value", "max", "segments", "hint", "valueLabel"] as const;

/** What the blocks whose `fetchUrl` declares no answer read, by block type. */
const ANSWERS_BY_TYPE = new Map<
  string,
  (descriptor: BlockTypeDescriptor) => BlockAnswer
>([
  [
    "TopListCard",
    (descriptor) =>
      objectAnswer([optionKey(descriptor, "items", "staticItems")]),
  ],
  ["StatGroup", listAnswer],
  ["KeyValueList", listAnswer],
  ["NavCardGrid", listAnswer],
  ["ActivityFeed", listAnswer],
  [
    "Meter",
    (descriptor) =>
      objectAnswer(
        METER_KEYS.map((key) => optionKey(descriptor, key, key, false)),
      ),
  ],
  ["Form", () => recordAnswer],
  ["ResourceForm", () => recordAnswer],
]);

/**
 * What block `descriptor` reads from its `fetchUrl`, or undefined for a block
 * whose answer is not checked here.
 */
function answerOf(descriptor: BlockTypeDescriptor): BlockAnswer | undefined {
  const byType = ANSWERS_BY_TYPE.get(descriptor.type);
  if (byType) return byType(descriptor);
  const source = Object.hasOwn(descriptor.config, "fetchUrl")
    ? descriptor.config.fetchUrl.ui?.responseShape
    : undefined;
  return source === undefined ? undefined : ANSWERS_BY_SOURCE.get(source);
}

/** The warnings of a spec's fixtures, filled as its pages compile. */
export interface FixtureAnswers {
  warnings: MockupIssue[];
  /** The pointer of each page of the spec, keyed by id. */
  pagePointers: ReadonlyMap<string, string>;
}

/** No warnings yet, for a spec of `pages`. */
export function fixtureAnswers(
  pages: readonly { id: string }[],
): FixtureAnswers {
  return {
    warnings: [],
    pagePointers: new Map(
      pages.map((page, index) => [page.id, `/pages/${index}`]),
    ),
  };
}

/**
 * Warns, at the fixture, of each way block `descriptor` at `pointer` cannot
 * read the fixture `node`'s `fetchUrl` names, saying what it reads and what
 * it got. A key no page holds is already an issue, and a page compiled on
 * its live routes reads no fixture.
 */
export function checkFixtureAnswer(
  descriptor: BlockTypeDescriptor,
  node: MockupNode,
  pointer: string,
  scope: FixtureScope & { answers: FixtureAnswers },
): void {
  const key = fixtureKeyOf(node.options?.fetchUrl);
  const reader = key === undefined ? undefined : answerOf(descriptor);
  if (key === undefined || !reader || scope.routes) return;
  const source = fixtureSource(scope, key);
  if (!source) return;
  const rows = rowsReadOneByOne(scope, source);
  const answer = rows ? rows.at(0) : source.value;
  if (answer === undefined) return;
  const page = scope.answers.pagePointers.get(source.pageId);
  const path =
    page === undefined
      ? `${pointer}/options/fetchUrl`
      : `${page}${jsonPointer(["fixtures", key])}`;
  scope.answers.warnings.push(
    ...reader.problems(answer).map((problem) => ({
      path,
      message: `fixture "${key}" read by ${descriptor.type} at ${pointer}: ${problem}`,
    })),
  );
}
