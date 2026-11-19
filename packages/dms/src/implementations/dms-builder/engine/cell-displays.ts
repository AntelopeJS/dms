/** The cell displays of the TableView the builder writes, and the options each takes. */

import type { CellDisplay } from "@antelopejs/interface-dms-builder";
import {
  type CellTone,
  DefaultDisplays,
} from "@antelopejs/interface-dms/base/table-view";
import { displayIds } from "@antelopejs/interface-dms/base/table-view/internal/column-display";
import { TONES } from "@antelopejs/interface-dms/base/types/tone";
import { z } from "zod";

const tone = z.enum(TONES);

const cellTone = z.enum([
  "default",
  "muted",
  "dimmed",
  "highlighted",
  "success",
  "warning",
  "error",
  "info",
  "primary",
]) satisfies z.ZodType<CellTone>;

const relativeDateStyle = z.enum([
  "relative",
  "day",
]) satisfies z.ZodType<DefaultDisplays.RelativeDateStyle>;

const identity = z
  .object({
    avatarField: z.string().optional(),
    icon: z.string().optional(),
    iconField: z.string().optional(),
    subtitleField: z.string().optional(),
    subtitleTone: cellTone.optional(),
    selfField: z.string().optional(),
    selfLabel: z.string().optional(),
    badges: z
      .array(
        z
          .object({
            field: z.string(),
            equals: z.unknown().optional(),
            notEquals: z.unknown().optional(),
            label: z.string(),
            tone: tone.optional(),
          })
          .strict(),
      )
      .optional(),
    storage: z.string().optional(),
    emptyLabel: z.string().optional(),
    emptyIcon: z.string().optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.IdentityDisplayOptions>;

const pills = z
  .object({
    labelKey: z.string().optional(),
    exclusive: z
      .object({
        field: z.string(),
        label: z.string(),
        icon: z.string().optional(),
      })
      .strict()
      .optional(),
    emptyLabel: z.string().optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.PillsDisplayOptions>;

const relativeDate = z
  .object({
    style: relativeDateStyle.optional(),
    tone: cellTone.optional(),
    nowWithinMs: z.number().optional(),
    nowLabel: z.string().optional(),
    emptyLabel: z.string().optional(),
    emptyTone: cellTone.optional(),
    soonWithinMs: z.number().optional(),
    soonTone: cellTone.optional(),
    pastStyle: relativeDateStyle.optional(),
    pastTone: cellTone.optional(),
    byField: z.string().optional(),
    byLabel: z.string().optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.RelativeDateDisplayOptions>;

const indicator = z
  .object({
    onLabel: z.string().optional(),
    offLabel: z.string().optional(),
    onIcon: z.string().optional(),
    offIcon: z.string().optional(),
    onTone: cellTone.optional(),
    offTone: cellTone.optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.IndicatorDisplayOptions>;

const statusPill = z
  .object({
    tones: z.record(tone).optional(),
    toneField: z.string().optional(),
    subField: z.string().optional(),
    subTone: cellTone.optional(),
    liveValues: z.array(z.string()).optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.StatusPillDisplayOptions>;

const twoLine = z
  .object({
    primaryField: z.string().optional(),
    subField: z.string().optional(),
    subTone: cellTone.optional(),
    emptyLabel: z.string().optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.TwoLineDisplayOptions>;

const progress = z
  .object({
    doneField: z.string(),
    totalField: z.string(),
    errorField: z.string().optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.ProgressDisplayOptions>;

const sparkline = z
  .object({ field: z.string(), tone: tone.optional() })
  .strict() satisfies z.ZodType<DefaultDisplays.SparklineDisplayOptions>;

const duration = z
  .object({
    unit: z.enum(["ms", "s"]).optional(),
    format: z.enum(["readable", "ms"]).optional(),
    toneField: z.string().optional(),
  })
  .strict() satisfies z.ZodType<DefaultDisplays.DurationDisplayOptions>;

const bytes = z.object({}).strict();

const text = z
  .object({ toneField: z.string().optional() })
  .strict() satisfies z.ZodType<DefaultDisplays.TextDisplayOptions>;

const mono = z
  .object({ copy: z.boolean().optional() })
  .strict() satisfies z.ZodType<DefaultDisplays.MonoDisplayOptions>;

/** The options schema of each cell display, by its id. */
const OPTION_SCHEMAS: ReadonlyMap<string, z.ZodTypeAny> = new Map<
  string,
  z.ZodTypeAny
>([
  ["identity", identity],
  ["pills", pills],
  ["relative_date", relativeDate],
  ["indicator", indicator],
  ["status_pill", statusPill],
  ["two_line", twoLine],
  ["progress", progress],
  ["sparkline", sparkline],
  ["duration", duration],
  ["bytes", bytes],
  ["string", text],
  ["mono", mono],
]);

/** A cell display the DMS draws itself: the class that declares it and the options it takes. */
export interface CellDisplayEntry {
  /** The class's name in `DefaultDisplays`. */
  className: string;
  options: z.ZodTypeAny;
}

/** The DMS's own cell displays, by id, each with an options schema. */
export const CELL_DISPLAYS: ReadonlyMap<string, CellDisplayEntry> = new Map(
  Object.entries(DefaultDisplays).flatMap(
    ([className, Display]): [string, CellDisplayEntry][] => {
      const id = displayIds.get(Display);
      const options = id === undefined ? undefined : OPTION_SCHEMAS.get(id);
      return id === undefined || options === undefined
        ? []
        : [[id, { className, options }]];
    },
  ),
);

/** The ids of every `DefaultDisplays` class, whether or not it has an options schema. */
export function defaultDisplayIds(): string[] {
  return Object.values(DefaultDisplays).flatMap((Display) => {
    const id = displayIds.get(Display);
    return id === undefined ? [] : [id];
  });
}

/** The id of the cell display `DefaultDisplays.<className>` declares, if it is one. */
export function cellDisplayIdOf(className: string): string | undefined {
  return [...CELL_DISPLAYS].find(
    ([, entry]) => entry.className === className,
  )?.[0];
}

/** A problem of a cell display, at its path in `{ type, options }`. */
export interface CellDisplayIssue {
  /** `/type` for a display the DMS does not draw, `/options/subField` for an option. */
  path: string;
  message: string;
}

function pointerOf(path: (string | number)[]): string {
  return ["options", ...path].map((segment) => `/${segment}`).join("");
}

/**
 * Why a cell display cannot be written: a `type` that names no DMS display,
 * or options its class does not take. None when it can.
 */
export function cellDisplayIssues(
  display: Pick<CellDisplay, "type"> & { options?: unknown },
): CellDisplayIssue[] {
  const entry = CELL_DISPLAYS.get(display.type);
  if (!entry) {
    return [
      {
        path: "/type",
        message: `"${display.type}" is not a cell display of the DMS; it draws ${[...CELL_DISPLAYS.keys()].join(", ")}`,
      },
    ];
  }
  const parsed = entry.options.safeParse(display.options ?? {});
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        path: pointerOf(issue.path),
        message: issue.message,
      }));
}

/** The issues of a cell display as one sentence, none when it can be written. */
export function cellDisplayRefusal(display: CellDisplay): string | undefined {
  const issues = cellDisplayIssues(display);
  const unknown = issues.find((issue) => issue.path === "/type");
  if (unknown || issues.length === 0) {
    return unknown?.message;
  }
  const described = issues.map(
    (issue) => `${issue.path.slice(1).replaceAll("/", ".")}: ${issue.message}`,
  );
  return `the ${display.type} display refuses its options: ${described.join("; ")}`;
}
