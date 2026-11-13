import { z } from "zod";

/** A value `JSON.parse` can answer. */
export type Json = string | number | boolean | null | Json[] | JsonObject;

/** A JSON object, keyed by property name. */
export interface JsonObject {
  [key: string]: Json;
}

/** Decodes any JSON value into {@link Json}. */
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);

/** Decodes a JSON object. */
export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(jsonSchema);

/** A mockup name or a page id. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A fixture key or an annotation id. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** How many pages a spec holds at most. */
export const MAX_PAGES = 50;

/** The names `/api/mockup/<segment>` routes take before a mockup's own. */
export const RESERVED_MOCKUP_NAMES: readonly string[] = ["schema"];

/**
 * A mockup's directory name under `mockups/`: never a path of its own, nor a
 * name a static route answers in its place.
 */
export const mockupNameSchema = z
  .string()
  .regex(SLUG_PATTERN)
  .refine((name) => !RESERVED_MOCKUP_NAMES.includes(name), {
    message: "is reserved by the mockup API",
  })
  .brand("Mockup");
export type MockupName = z.infer<typeof mockupNameSchema>;

/** A page id, unique within its spec. */
export const pageIdSchema = z.string().regex(SLUG_PATTERN);

/** A key of a page's `fixtures`. */
export const fixtureKeySchema = z.string().regex(KEY_PATTERN);

/** The id of an annotation. */
export const annotationIdSchema = z.string().regex(KEY_PATTERN);

/** The mockup named `raw`, or undefined when `raw` is not a valid name. */
export function parseMockupName(raw: string): MockupName | undefined {
  const parsed = mockupNameSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * A node of a page tree: the tree format `DmsBlockPreview` draws, plus the
 * `sketch` type and `fixture:` references the compiler resolves.
 */
export interface MockupNode {
  type?: string;
  componentName?: string;
  options?: JsonObject;
  children?: MockupNode[];
  id?: string;
  slot?: string;
  colSpan?: number;
}

const nodeSchema: z.ZodType<MockupNode> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      componentName: z.string().optional(),
      options: jsonObjectSchema.optional(),
      children: z.array(nodeSchema).optional(),
      id: z.string().optional(),
      slot: z.string().optional(),
      colSpan: z.number().optional(),
    })
    .strict(),
);

const pageOptionsSchema = z
  .object({
    theme: z.enum(["light", "dark"]).optional(),
    locale: z.string().optional(),
    padding: z.boolean().optional(),
  })
  .strict();

/** How a page is drawn: its color mode, its language and its padding. */
export type MockupPageOptions = z.infer<typeof pageOptionsSchema>;

const pageSchema = z
  .object({
    id: pageIdSchema,
    title: z.string(),
    options: pageOptionsSchema.optional(),
    fixtures: z.record(fixtureKeySchema, jsonSchema).optional(),
    tree: z.array(nodeSchema),
  })
  .strict();

/** One page of a spec, as written. */
export type MockupSpecPage = z.infer<typeof pageSchema>;

/** Who writes a mockup: the dashboard chat, Claude Code or Codex. */
export const MOCKUP_SOURCES = ["chat", "claude-code", "codex"] as const;
export type MockupSource = (typeof MOCKUP_SOURCES)[number];

/** Decodes a {@link MockupSource}. */
export const mockupSourceSchema = z.enum(MOCKUP_SOURCES);

/**
 * A path of the dashboard: one `/`, then no whitespace. A second `/` or a
 * backslash would make browsers read an external host, and a scheme never
 * starts with `/`.
 */
export const DASHBOARD_PATH_PATTERN = /^\/(?![/\\])\S*$/;
/** How long a dashboard path is at most. */
export const MAX_DASHBOARD_PATH = 2048;

const dashboardPathSchema = z
  .string()
  .max(MAX_DASHBOARD_PATH)
  .regex(DASHBOARD_PATH_PATTERN);

/** Decodes what the build step wrote of a mockup: when, and the pages it made. */
export const mockupBuiltSchema = z
  .object({
    at: z.string().datetime(),
    pages: z
      .array(
        z
          .object({ path: dashboardPathSchema, title: z.string().optional() })
          .strict(),
      )
      .min(1)
      .max(MAX_PAGES),
  })
  .strict();

/** `mockups/<name>/spec.json`, as written. */
export const specSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    title: z.string().optional(),
    source: mockupSourceSchema.optional(),
    built: mockupBuiltSchema.optional(),
    pages: z.array(pageSchema).min(1).max(MAX_PAGES),
  })
  .strict()
  .superRefine((spec, context) => {
    const seen = new Set<string>();
    spec.pages.forEach((page, index) => {
      if (seen.has(page.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pages", index, "id"],
          message: `another page already has the id "${page.id}"`,
        });
      }
      seen.add(page.id);
    });
  });

export type MockupSpec = z.infer<typeof specSchema>;

/** A problem of a spec, at a JSON pointer into `spec.json`. */
export interface MockupIssue {
  /** `""` names the whole file. */
  path: string;
  message: string;
}

/** A page as the viewer draws it. */
export interface MockupPageState {
  id: string;
  title: string;
  options: MockupPageOptions;
  /** Fixture references rewritten, controller blocks compiled. */
  tree: MockupNode[];
  /** The spec pointer of each node, keyed by its `DmsBlockPreview` layout path. */
  paths: Record<string, string>;
}

/** What the browser receives of a mockup. */
export interface MockupState {
  name: MockupName;
  title?: string;
  /** Increments on every read of `spec.json`. */
  revision: number;
  pages: MockupPageState[];
  /** Empty when the spec is valid. */
  issues: MockupIssue[];
}

/** RFC 6901: the root is the empty string, `~` and `/` are escaped. */
export function jsonPointer(path: ReadonlyArray<string | number>): string {
  return path
    .map(
      (segment) =>
        `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`,
    )
    .join("");
}

/** The issues of a failed zod parse, each prefixed with `base`. */
export function zodIssues(base: string, error: z.ZodError): MockupIssue[] {
  return error.issues.map((issue) => ({
    path: `${base}${jsonPointer(issue.path)}`,
    message: issue.message,
  }));
}
