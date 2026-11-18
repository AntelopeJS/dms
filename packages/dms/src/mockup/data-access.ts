import { z } from "zod";
import { nodesUnder, type SpecNode } from "./form-page-modes";
import {
  type Json,
  type JsonObject,
  jsonObjectSchema,
  jsonPointer,
  type MockupData,
  type MockupIssue,
  type MockupSpec,
} from "./model";

/** The JSON Schema of a spec's `data`. */
export const DATA_SCHEMA: JsonObject = {
  type: "object",
  required: ["connection"],
  additionalProperties: false,
  description:
    'Where the mockup\'s data comes from. With access "read", every option that writes rows is an issue naming the connection: rowActions add, edit, duplicate, delete, archive and restore, archiveMode and kanban.draggable on a TableView, and a ResourceForm in a mode other than "view". Only details is allowed on a table.',
  properties: {
    connection: {
      type: "string",
      minLength: 1,
      description:
        "The external connection the app reads, by its id in config.externalConnections of the dms-database module, e.g. crm.",
    },
    access: {
      enum: ["read", "read-write"],
      default: "read",
      description:
        'What the project lets the DMS do on the connection, as config.externalConnections.<id>.access of dms-database: "read" (the default) or "read-write".',
    },
  },
};

const TABLE_TYPE = "TableView";
const RESOURCE_FORM_TYPE = "ResourceForm";

/** The `ResourceForm` mode that only reads its row. */
const VIEW_MODE = "view";

/** The row actions of a table that write rows: every one but details and copy link. */
const WRITING_ROW_ACTIONS = [
  "add",
  "edit",
  "duplicate",
  "delete",
  "archive",
  "restore",
] as const;

const rowActionSchema = z.union([
  z.boolean(),
  z.object({ isEnabled: z.boolean().optional() }).passthrough(),
]);

/** Whether a row action as written is on: `true`, or a config not turned off. */
function isOn(action: Json | undefined): boolean {
  const parsed = rowActionSchema.safeParse(action);
  if (!parsed.success || parsed.data === false) return false;
  return parsed.data === true || parsed.data.isEnabled !== false;
}

/** An option of a block that writes rows: where it sits under the node's options, when it writes, and what to do instead. */
interface WritingOption {
  type: string;
  at: readonly string[];
  writes: (value: Json | undefined) => boolean;
  fix: string;
}

const TABLE_FIX =
  "leave it out, as a table over it only lists rows and opens their details";

/**
 * The options that write rows, by block type: a table's writing row actions,
 * its archive mode and a kanban board whose cards move, and a `ResourceForm`
 * in a mode that saves.
 */
const WRITING_OPTIONS: readonly WritingOption[] = [
  ...WRITING_ROW_ACTIONS.map((action): WritingOption => ({
    type: TABLE_TYPE,
    at: ["rowActions", action],
    writes: isOn,
    fix: TABLE_FIX,
  })),
  {
    type: TABLE_TYPE,
    at: ["archiveMode"],
    writes: (value) => value === true,
    fix: TABLE_FIX,
  },
  {
    type: TABLE_TYPE,
    at: ["kanban", "draggable"],
    writes: (value) => value === true,
    fix: "leave it out, so the board's cards stay where they are",
  },
  {
    type: RESOURCE_FORM_TYPE,
    at: ["mode"],
    writes: (value) => value !== undefined && value !== VIEW_MODE,
    fix: 'set mode to "view", so the form shows the row read-only',
  },
];

/** The value at `at` under `options`, when every step on the way is an object holding the next key. */
function valueAt(
  options: JsonObject | undefined,
  at: readonly string[],
): Json | undefined {
  let value: Json | undefined = options;
  for (const key of at) {
    const object = jsonObjectSchema.safeParse(value);
    if (!object.success || !Object.hasOwn(object.data, key)) return undefined;
    value = object.data[key];
  }
  return value;
}

/** An option as a message names it: its path, and its value when it is a word, as `mode "edit"`. */
function optionText(at: readonly string[], value: Json | undefined): string {
  const word = z.string().safeParse(value);
  const name = at.join(".");
  return word.success ? `${name} ${JSON.stringify(word.data)}` : name;
}

function writingIssues(
  { node, path }: SpecNode,
  { connection }: MockupData,
): MockupIssue[] {
  return WRITING_OPTIONS.filter(({ type }) => node.type === type).flatMap(
    ({ at, writes, fix }) => {
      const value = valueAt(node.options, at);
      if (!writes(value)) return [];
      return [
        {
          path: jsonPointer([...path, "options", ...at]),
          message: `${optionText(at, value)} writes rows, and the connection "${connection}" is read-only (data.access is "read"): ${fix}`,
        },
      ];
    },
  );
}

/**
 * The options of `spec` that write rows of its connection while `data.access`
 * is `"read"`, each at its pointer and naming the connection, as the builder
 * refuses them on a read-only connection. None for a spec with no `data`, or
 * one whose access is `"read-write"`.
 */
export function readOnlyConnectionIssues(spec: MockupSpec): MockupIssue[] {
  const { data } = spec;
  if (data?.access !== "read") return [];
  return spec.pages.flatMap((page, index) =>
    page.tree
      .flatMap((node, at) =>
        nodesUnder(node, page.id, ["pages", index, "tree", at]),
      )
      .flatMap((node) => writingIssues(node, data)),
  );
}
