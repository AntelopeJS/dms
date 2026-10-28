/**
 * A Grid's rows share its template, but a GridRow nested in one of their
 * cells (inside a Section, say) is not one of those rows: it lays out its own
 * children, at the default track floor, rather than inheriting the outer
 * grid's column count and leaving empty tracks beside its cells. A Grid inside
 * a cell keeps its own rows aligned.
 */
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  inject,
  onUnmounted,
  provide,
  ref,
  useId,
  watchEffect,
  type Component,
  type FunctionalComponent,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { beforeAll, expect, it, vi } from "vitest";
import {
  GRID_DEFAULT_MIN_COLUMN_WIDTH,
  gridColumnsTemplate,
} from "../layers/dms-ui/app/components/grid/columns";
import {
  GRID_DECLARED_COLUMNS,
  type GridDeclaredColumns,
} from "../layers/dms-ui/app/components/grid/constants";

let Grid: Component;
let GridRow: Component;

beforeAll(async () => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("provide", provide);
  vi.stubGlobal("watchEffect", watchEffect);
  vi.stubGlobal("onUnmounted", onUnmounted);
  vi.stubGlobal("useId", useId);
  Grid = (await import("../layers/dms-ui/app/components/grid/Grid.vue"))
    .default;
  GridRow = (await import("../layers/dms-ui/app/components/grid/GridRow.vue"))
    .default;
});

/** A container block between a row's cell and what it holds. */
const Section: FunctionalComponent = (_props, { slots }) =>
  h("section", slots.default?.());

const Card: FunctionalComponent = () => h("article", "card");

const OUTER_MIN = "300px";
const OUTER_GAP = "2rem";
const DEFAULT_GAP = "1rem";

interface GridOptions {
  gap?: string;
  minColumnWidth?: string;
}

/**
 * A Grid as RecursiveComponent draws it: the layout declares its widest row,
 * so the server lays every row out at the final count from the first one on.
 */
function grid(
  id: string,
  options: GridOptions,
  rows: { columns: number; render: () => ReturnType<typeof h> }[],
) {
  const Declared = defineComponent({
    setup() {
      provide<GridDeclaredColumns>(GRID_DECLARED_COLUMNS, {
        componentId: id,
        columns: computed(() => Math.max(0, ...rows.map((r) => r.columns))),
      });
      return () =>
        h(
          Grid,
          { pageId: "page", componentId: id, ...options },
          { default: () => rows.map((r) => r.render()) },
        );
    },
  });
  return h(Declared);
}

function row(id: string, children: (() => ReturnType<typeof h>)[]) {
  return h(
    GridRow,
    { pageId: "page", componentId: id, childCount: children.length },
    { default: () => children.map((child) => child()) },
  );
}

const cards = (count: number) =>
  Array.from({ length: count }, () => () => h(Card));

/** The inline `grid-template-columns` of the element scoped to `id`. */
function templateOf(html: string, id: string): string | undefined {
  const element = html.match(
    new RegExp(`<div style="([^"]*)"[^>]*data-dms-grid="dms-grid-${id}"`),
  );
  return element?.[1].match(/grid-template-columns:([^;]*);/)?.[1].trim();
}

function render(root: () => ReturnType<typeof h>): Promise<string> {
  return renderToString(createSSRApp({ render: root }));
}

/** Grid > row of three groups > Section > row of `inner` cards each. */
function groupedOverview(inner: number) {
  return () =>
    grid("overview", { gap: OUTER_GAP, minColumnWidth: OUTER_MIN }, [
      {
        columns: 3,
        render: () =>
          row(
            "groups",
            ["reach", "engagement", "health"].map(
              (group) => () =>
                h(Section, null, { default: () => row(group, cards(inner)) }),
            ),
          ),
      },
    ]);
}

it("lays a row nested in a cell out on its own children, not the grid's columns", async () => {
  const html = await render(groupedOverview(2));

  expect(templateOf(html, "reach")).toBe(
    gridColumnsTemplate(2, DEFAULT_GAP, GRID_DEFAULT_MIN_COLUMN_WIDTH),
  );
  expect(templateOf(html, "health")).toBe(
    gridColumnsTemplate(2, DEFAULT_GAP, GRID_DEFAULT_MIN_COLUMN_WIDTH),
  );
});

it("keeps the grid's own rows on its widest row's columns", async () => {
  const html = await render(() =>
    grid("board", { gap: OUTER_GAP, minColumnWidth: OUTER_MIN }, [
      { columns: 2, render: () => row("kpis", cards(2)) },
      { columns: 3, render: () => row("charts", cards(3)) },
    ]),
  );

  const shared = gridColumnsTemplate(3, OUTER_GAP, OUTER_MIN);
  expect(templateOf(html, "kpis")).toBe(shared);
  expect(templateOf(html, "charts")).toBe(shared);
});

it("still lines the outer row up on the grid's columns", async () => {
  const html = await render(groupedOverview(2));

  expect(templateOf(html, "groups")).toBe(
    gridColumnsTemplate(3, OUTER_GAP, OUTER_MIN),
  );
});

it("does not let a nested row widen the outer grid", async () => {
  const html = await render(groupedOverview(4));

  expect(templateOf(html, "overview")).toBe(
    gridColumnsTemplate(3, OUTER_GAP, OUTER_MIN),
  );
  expect(templateOf(html, "reach")).toBe(
    gridColumnsTemplate(4, DEFAULT_GAP, GRID_DEFAULT_MIN_COLUMN_WIDTH),
  );
});

it("aligns the rows of a Grid nested in a cell on that grid", async () => {
  const html = await render(() =>
    grid("outer", { gap: OUTER_GAP, minColumnWidth: OUTER_MIN }, [
      {
        columns: 2,
        render: () =>
          row("top", [
            () =>
              grid("inner", { minColumnWidth: "120px" }, [
                { columns: 4, render: () => row("inner-a", cards(4)) },
                { columns: 1, render: () => row("inner-b", cards(1)) },
              ]),
            () => h(Card),
          ]),
      },
    ]),
  );

  const inner = gridColumnsTemplate(4, DEFAULT_GAP, "120px");
  expect(templateOf(html, "inner-a")).toBe(inner);
  expect(templateOf(html, "inner-b")).toBe(inner);
  expect(templateOf(html, "top")).toBe(
    gridColumnsTemplate(2, OUTER_GAP, OUTER_MIN),
  );
});

it("emits the nested row's responsive rules for its own column count", async () => {
  const html = await render(groupedOverview(2));
  const reachRules = html
    .match(/<style>[\s\S]*?<\/style>/g)
    ?.filter((sheet) => sheet.includes('data-dms-grid="dms-grid-reach"'));

  expect(reachRules).toHaveLength(1);
  expect(reachRules?.[0]).toContain("--dms-grid-tracks: 1;");
  expect(reachRules?.[0]).not.toContain("--dms-grid-tracks: 2;");
  expect(reachRules?.[0]).toContain("span min(2, var(--dms-grid-tracks, 2))");
  expect(reachRules?.[0]).not.toContain("span min(3,");
});
