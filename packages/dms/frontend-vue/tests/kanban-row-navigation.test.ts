// @vitest-environment jsdom
/**
 * A board reads its rows column by column, apart from the table's list: it
 * hands the cards it shows to the table view (`rows-shown`, then the display
 * context's `setShownRows`) in the order the user reads them, so a card's
 * drawer steps through them ("3 of 5", previous / next, J and K).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./helpers/table-runtime";
import { useRealDataEngine } from "./fixtures/dataEngine";
import {
  type App,
  type Component,
  Suspense,
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  ref,
  watch,
} from "vue";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));

interface Deal {
  _id: string;
  stage: string;
}

const DEALS: Deal[] = [
  { _id: "d1", stage: "lead" },
  { _id: "d2", stage: "won" },
  { _id: "d3", stage: "lead" },
  { _id: "d4", stage: "proposal" },
  { _id: "d5", stage: "won" },
];

const STAGE_COLUMN = {
  accessorKey: "stage",
  type: {
    id: "select",
    inputComponent: {
      options: {
        items: [
          { value: "lead", label: "Lead" },
          { value: "proposal", label: "Proposal" },
          { value: "won", label: "Won" },
        ],
      },
    },
  },
};

let app: App | undefined;
let host: HTMLDivElement;

// The list route, filtered on one column as the board asks for it.
const authFetch = vi.fn(
  async (_url: string, { query }: { query: Record<string, string> }) => {
    const stage = query.filter_stage!.replace("is:", "");
    const results = DEALS.filter((deal) => deal.stage === stage);
    return { results, total: results.length };
  },
);

beforeEach(() => {
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    h,
    inject,
    useAuthFetch: () => ({ $authFetch: authFetch }),
    useI18n: () => ({ locale: ref("en"), t: (key: string) => key }),
    useToast: () => ({ add: vi.fn() }),
    resolveDmsComponent: () => undefined,
  })) {
    vi.stubGlobal(name, value);
  }
  useRealDataEngine();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

async function mountBoard(onRowsShown: (rows: Deal[]) => void) {
  const { default: KanbanBoard } = await import(
    "../layers/dms-ui/app/components/table-view/KanbanBoard.vue"
  );
  app = createApp({
    render: () =>
      h(Suspense, null, {
        default: () =>
          h(KanbanBoard as Component, {
            groupByField: "stage",
            location: "/deals",
            columns: [STAGE_COLUMN],
            baseQuery: {},
            onRowsShown,
          }),
      }),
  });
  for (const name of ["UButton", "UIcon", "USkeleton"]) {
    app.component(name, defineComponent({ setup: () => () => h("span") }));
  }
  app.mount(host);
  await flushPromises();
  await nextTick();
}

describe("a board's rows for its drawers", () => {
  it("hands the cards it shows, column by column", async () => {
    const shown: Deal[][] = [];
    await mountBoard((rows) => shown.push(rows));
    expect(shown.at(-1)?.map((deal) => deal._id)).toEqual([
      "d1",
      "d3",
      "d4",
      "d2",
      "d5",
    ]);
  });
});
