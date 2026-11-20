import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import type { ConnectionAccess } from "@antelopejs/interface-dms/connection-access";
import { TONES } from "@antelopejs/interface-dms/base/types/tone";
import { z } from "zod";
import { generatedFixtureSchema, holdsGenerate } from "./generate";
import { type MockupModule, moduleIssues } from "./modules";
import { liveRouteSchema, relativeRouteSchema } from "./route-patterns";

export * from "./route-patterns";
export * from "./modules";
import {
  SKETCH_MAX_CAPTION,
  SIDEBAR_WIDGET_MAX_HEIGHT,
  SKETCH_MAX_SOURCE,
  SKETCH_MIN_HEIGHT,
} from "./sketch-limits";

/** A value `JSON.parse` can answer. */
export type Json = string | number | boolean | null | Json[] | JsonObject;

/** A JSON object, keyed by property name. */
export interface JsonObject {
  [key: string]: Json;
}

/** Decodes any JSON value into {@link Json}. */
export const jsonSchema: z.ZodType<Json> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.lazy(() => jsonSchema)),
  z.record(z.lazy(() => jsonSchema)),
]);

/** Decodes a JSON object. */
export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(jsonSchema);

/** A mockup name or a page id. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A fixture key or an annotation id. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** How many pages a spec holds at most. */
export const MAX_PAGES = 50;

/** The names `/api/mockup/<segment>` routes take before a mockup's own. */
export const RESERVED_MOCKUP_NAMES: readonly string[] = ["schema", "example"];

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

const nodeSchema: z.ZodType<MockupNode> = z
  .object({
    type: z.string().optional(),
    componentName: z.string().optional(),
    options: jsonObjectSchema.optional(),
    children: z.array(z.lazy(() => nodeSchema)).optional(),
    id: z.string().optional(),
    slot: z.string().optional(),
    colSpan: z.number().optional(),
  })
  .strict();

const pageOptionsSchema = z
  .object({
    theme: z.enum(["light", "dark"]).optional(),
    locale: z.string().optional(),
    padding: z.boolean().optional(),
  })
  .strict();

/** How a page is drawn: its color mode, its language and its padding. */
export type MockupPageOptions = z.infer<typeof pageOptionsSchema>;

/**
 * The live page a spec page was converted from: its builder ref, and the
 * version of its source file at the conversion.
 */
const livePageSchema = z
  .object({ ref: z.string().min(1), version: z.string() })
  .strict();

export type MockupLivePage = z.infer<typeof livePageSchema>;

/**
 * A button right of a page's title: the look of a `PageHeaderButton` of
 * `DefaultLayout({ headerActions })`. Where it goes is code, so a mockup holds
 * none.
 */
const headerActionSchema = z
  .object({
    label: z.string(),
    icon: z.string().optional(),
    color: z.enum(TONES).optional(),
    variant: z.nativeEnum(ButtonVariant).optional(),
  })
  .strict();

export type MockupHeaderAction = z.infer<typeof headerActionSchema>;

/**
 * A section of the sidebar, as a category of the dashboard's menu groups its
 * pages under a header: its id, its title and its icon.
 */
const categorySchema = z
  .object({
    id: pageIdSchema,
    title: z.string(),
    icon: z.string().optional(),
  })
  .strict();

export type MockupCategory = z.infer<typeof categorySchema>;

/** How many widgets a mockup adds to the sidebar at most. */
export const MAX_SIDEBAR_WIDGETS = 10;

/** The frame height of a sidebar widget that names none: a card, not a page section. */
export const SIDEBAR_WIDGET_DEFAULT_HEIGHT = 120;

/**
 * A sketch the sidebar draws below its own widgets, in every page of the
 * mockup: a sketch's `html`, `css` and `height`, and `title` as its caption.
 */
const sidebarWidgetSchema = z
  .object({
    id: pageIdSchema,
    title: z.string().max(SKETCH_MAX_CAPTION).optional(),
    html: z.string().max(SKETCH_MAX_SOURCE),
    css: z.string().max(SKETCH_MAX_SOURCE).optional(),
    height: z
      .number()
      .int()
      .min(SKETCH_MIN_HEIGHT)
      .max(SIDEBAR_WIDGET_MAX_HEIGHT)
      .optional(),
  })
  .strict();

export type MockupSidebarWidget = z.infer<typeof sidebarWidgetSchema>;

/** What a mockup adds to the sidebar beside its pages. */
const sidebarSchema = z
  .object({
    widgets: z.array(sidebarWidgetSchema).max(MAX_SIDEBAR_WIDGETS),
  })
  .strict();

export type MockupSidebar = z.infer<typeof sidebarSchema>;

/** A route a sub-page takes: one parameter, `:` and its name. */
export const ROUTE_PARAM_PATTERN = /^:[A-Za-z_][A-Za-z0-9_]*$/;

const pageSchema = z
  .object({
    id: pageIdSchema,
    title: z.string(),
    category: z.string().optional(),
    menu: z.boolean().optional(),
    parent: pageIdSchema.optional(),
    route: z.string().regex(ROUTE_PARAM_PATTERN).optional(),
    icon: z.string().optional(),
    description: z.string().optional(),
    headerActions: z.array(headerActionSchema).optional(),
    options: pageOptionsSchema.optional(),
    livePage: livePageSchema.optional(),
    liveRoutes: z.record(fixtureKeySchema, liveRouteSchema).optional(),
    fixtures: z.record(fixtureKeySchema, jsonSchema).optional(),
    custom: z.boolean().optional(),
    html: jsonSchema.optional(),
    css: jsonSchema.optional(),
    height: jsonSchema.optional(),
    states: jsonSchema.optional(),
    tree: z.array(nodeSchema).default([]),
  })
  .strict()
  .superRefine((page, context) => {
    for (const [key, value] of Object.entries(page.fixtures ?? {})) {
      if (!holdsGenerate(value)) continue;
      const generated = generatedFixtureSchema.safeParse(value);
      if (generated.success) continue;
      for (const issue of generated.error.issues) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixtures", key, ...issue.path],
          message: issue.message,
        });
      }
    }
  });

/** One page of a spec, as written. */
export type MockupSpecPage = z.infer<typeof pageSchema>;

type Issue = (path: (string | number)[], message: string) => void;

/** The fields of a custom page that make it one sketch, which a page of blocks has none of. */
export const CUSTOM_PAGE_FIELDS = ["html", "css", "height", "states"] as const;

/**
 * Reports a custom page holding blocks or no `html`, and a page of blocks
 * holding a custom page's sketch fields, each at its field.
 */
function checkCustomPages(
  pages: readonly MockupSpecPage[],
  issue: Issue,
): void {
  pages.forEach((page, index) => {
    if (page.custom === true) {
      if (page.tree.length > 0) {
        issue(
          ["pages", index, "tree"],
          "a custom page is one sketch: write it in html, and leave tree out or empty",
        );
      }
      if (page.html === undefined) {
        issue(
          ["pages", index, "html"],
          "a custom page draws its html: write it",
        );
      }
      return;
    }
    for (const field of CUSTOM_PAGE_FIELDS) {
      if (page[field] !== undefined) {
        issue(
          ["pages", index, field],
          `${field} belongs to a custom page: set custom to true, or move it into a sketch block`,
        );
      }
    }
  });
}

/**
 * Reports each page whose `parent` no page has, or whose parents lead back to
 * it, at its `parent`, and each `route` of a page without a parent.
 */
function checkParents(pages: readonly MockupSpecPage[], issue: Issue): void {
  const parentOf = new Map(pages.map((page) => [page.id, page.parent]));
  pages.forEach((page, index) => {
    if (page.route !== undefined && page.parent === undefined) {
      issue(
        ["pages", index, "route"],
        "a route parameter names a row of the parent's rows: give the page a parent",
      );
    }
    if (page.parent === undefined) return;
    if (!parentOf.has(page.parent)) {
      issue(["pages", index, "parent"], `no page has the id "${page.parent}"`);
      return;
    }
    const seen = new Set<string>();
    for (let at: string | undefined = page.parent; at; at = parentOf.get(at)) {
      if (at === page.id) {
        issue(
          ["pages", index, "parent"],
          `the parents of "${page.id}" lead back to it`,
        );
        return;
      }
      if (seen.has(at)) return;
      seen.add(at);
    }
  });
}

/** Who writes a mockup: the dashboard chat, Claude Code or Codex. */
export const MOCKUP_SOURCES = ["chat", "claude-code", "codex"] as const;
export type MockupSource = (typeof MOCKUP_SOURCES)[number];

/** Decodes a {@link MockupSource}. */
export const mockupSourceSchema = z.enum(MOCKUP_SOURCES);

/** Decodes what the build step wrote of a mockup: when, and the pages it made. */
export const mockupBuiltSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    pages: z
      .array(
        z
          .object({ path: relativeRouteSchema, title: z.string().optional() })
          .strict(),
      )
      .min(1)
      .max(MAX_PAGES),
  })
  .strict();

/** The values `config.externalConnections.<id>.access` of dms-database takes. */
const connectionAccessSchema = z.enum([
  "read",
  "read-write",
]) satisfies z.ZodType<ConnectionAccess>;

/**
 * Where a mockup's data comes from: the external connection the app will read,
 * by its id in `config.externalConnections` of dms-database, and what the
 * project lets the DMS do on it, `"read"` unless it says `"read-write"`, as
 * dms-database reads it.
 */
const specDataSchema = z
  .object({
    connection: z.string().min(1),
    access: connectionAccessSchema.default("read"),
  })
  .strict();

export type MockupData = z.infer<typeof specDataSchema>;

/** `mockups/<name>/spec.json`, as written. */
export const specSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    title: z.string().optional(),
    source: mockupSourceSchema.optional(),
    built: mockupBuiltSchema.optional(),
    data: specDataSchema.optional(),
    categories: z.array(categorySchema).max(MAX_PAGES).optional(),
    sidebar: sidebarSchema.optional(),
    modules: z.array(z.string()).max(MAX_PAGES).optional(),
    pages: z.array(pageSchema).max(MAX_PAGES),
  })
  .strict()
  .superRefine((spec, context) => {
    const issue: Issue = (path, message) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path, message });
    checkParents(spec.pages, issue);
    checkCustomPages(spec.pages, issue);
    const categories = new Set<string>();
    spec.categories?.forEach((category, index) => {
      if (categories.has(category.id)) {
        issue(
          ["categories", index, "id"],
          `another category already has the id "${category.id}"`,
        );
      }
      categories.add(category.id);
    });
    const widgets = new Set<string>();
    spec.sidebar?.widgets.forEach((widget, index) => {
      if (widgets.has(widget.id)) {
        issue(
          ["sidebar", "widgets", index, "id"],
          `another sidebar widget already has the id "${widget.id}"`,
        );
      }
      widgets.add(widget.id);
    });
    for (const { index, message } of moduleIssues(spec.modules ?? [])) {
      issue(["modules", index], message);
    }
    const known = categories.size
      ? `the categories are ${[...categories].join(", ")}`
      : "the spec has no categories";
    const seen = new Set<string>();
    spec.pages.forEach((page, index) => {
      if (seen.has(page.id)) {
        issue(
          ["pages", index, "id"],
          `another page already has the id "${page.id}"`,
        );
      }
      seen.add(page.id);
      if (page.category !== undefined && !categories.has(page.category)) {
        issue(
          ["pages", index, "category"],
          `no category has the id "${page.category}": ${known}`,
        );
      }
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
  /** The id of the sidebar section the page is in; none for the default one. */
  category?: string;
  /** The sidebar leaves the page out. */
  menu?: false;
  /** The page is one sketch, drawn as its whole `tree`, inside the page header and the sidebar. */
  custom?: true;
  /**
   * The mockup drew the page, not the spec: the generated form page of a
   * table that opens its forms on pages. It has no spec page, so nothing on it
   * is edited or commented.
   */
  generated?: true;
  /** The page it is a sub-page of. */
  parent?: string;
  /**
   * Its route parameter, without the colon, and the id of the row it shows
   * while no link names one: the first of the first ancestor's rows it reads.
   */
  route?: { param: string; sample?: string };
  /** The pages it links to, in the spec's order. */
  links: string[];
  icon?: string;
  description?: string;
  headerActions?: MockupHeaderAction[];
  options: MockupPageOptions;
  /** Fixture references rewritten, controller blocks compiled. */
  tree: MockupNode[];
  /**
   * `tree` with each fixture named in the page's `liveRoutes` read from its
   * live route instead: what the viewer draws with Real data on. Present
   * only when the page has `liveRoutes`; its layout paths are `tree`'s.
   */
  realTree?: MockupNode[];
  livePage?: Pick<MockupLivePage, "ref">;
  /** The spec pointer of each node, keyed by its `DmsBlockPreview` layout path. */
  paths: Record<string, string>;
}

/** A sidebar widget as the viewer draws it: its markup checked, its height set. */
export interface MockupSidebarWidgetState {
  id: string;
  title?: string;
  /** Empty when the spec's markup or CSS was refused. */
  html: string;
  css?: string;
  height: number;
}

/** The sidebar widgets as the viewer draws them, in order. */
export interface MockupSidebarState {
  widgets: MockupSidebarWidgetState[];
}

/** What the browser receives of a mockup. */
export interface MockupState {
  name: MockupName;
  title?: string;
  /** Increments on every read of `spec.json`. */
  revision: number;
  /** The sidebar's sections, in the menu's order; absent when the spec has none. */
  categories?: MockupCategory[];
  /** The sketches the sidebar draws below its own widgets; absent when the spec has none. */
  sidebar?: MockupSidebarState;
  /** The DMS modules the app needs, from the store catalog; absent when the spec lists none. */
  modules?: MockupModule[];
  pages: MockupPageState[];
  /** Empty when the spec is valid. */
  issues: MockupIssue[];
}

/** Whether `value` is a JSON object: neither an array nor a scalar. */
export function isJsonObject(value: Json | undefined): value is JsonObject {
  return value instanceof Object && !Array.isArray(value);
}

/** The value at JSON pointer `pointer` of `value`, or undefined when it names none. */
export function specValueAt(value: Json, pointer: string): Json | undefined {
  return pointer
    .split("/")
    .slice(1)
    .reduce<Json | undefined>((at, segment) => {
      if (Array.isArray(at)) return at[Number(segment)];
      return isJsonObject(at) && Object.hasOwn(at, segment)
        ? at[segment]
        : undefined;
    }, value);
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
