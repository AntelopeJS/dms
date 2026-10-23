// @vitest-environment jsdom
/**
 * A card dropped on a column the server refuses for a mandatory field it
 * lacks (a deal moved to "Lost" without its reason): the toast names the
 * field by its column's label, translated, never the raw fetch error line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

type ChangeHandler = (event: { added?: { element: unknown } }) => unknown;
const changeHandlers: ChangeHandler[] = [];

vi.mock(
  "../layers/dms-ui/app/build/components/sortable/SortableList.vue",
  () => ({
    default: defineComponent({
      props: { list: { type: Array, default: () => [] } },
      emits: ["change"],
      setup: (_, { emit }) => {
        changeHandlers.push((event) => emit("change", event));
        return () => h("div");
      },
    }),
  }),
);

const DEAL = { _id: "d1", stage: "lead", lostReason: null };

const STAGE_COLUMN = {
  accessorKey: "stage",
  header: "Stage",
  type: {
    id: "select",
    inputComponent: {
      options: {
        items: [
          { value: "lead", label: "Lead" },
          { value: "lost", label: "Lost" },
        ],
      },
    },
  },
};
const LOST_REASON_COLUMN = {
  accessorKey: "lostReason",
  header: "Loss reason",
  type: { id: "select" },
};

// What an ofetch FetchError carries for the edit route's refusal.
const refusal = Object.assign(
  new Error('[PUT] "/deals/edit?id=d1": 400 Bad Request'),
  {
    name: "FetchError",
    statusCode: 400,
    data: { code: "missing_mandatory_fields", fields: ["lostReason"] },
  },
);

const authFetch = vi.fn(
  async (url: string, options: { query?: Record<string, string> } = {}) => {
    if (url.endsWith("/edit")) throw refusal;
    if (url.endsWith("/get")) return { ...DEAL };
    const stage = options.query?.filter_stage?.replace("is:", "");
    const results = stage === DEAL.stage ? [{ ...DEAL }] : [];
    return { results, total: results.length };
  },
);

const addToast = vi.fn();

const translate = (key: string, params?: Record<string, unknown>) =>
  key === "dms.field_errors.named_required"
    ? `${String(params?.field)} est obligatoire.`
    : key;

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  changeHandlers.length = 0;
  addToast.mockClear();
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    h,
    inject,
    useId: () => "board",
    useAuthFetch: () => ({ $authFetch: authFetch }),
    useTranslation: () => ({
      processI18n: (text: string) => text,
      processApiMessage: (text: string) => text,
    }),
    useDataTypes: () => ({ getDataType: () => undefined }),
    useI18n: () => ({ locale: ref("fr"), t: translate }),
    useToast: () => ({ add: addToast }),
    normalizeActionConfig: () => ({ isEnabled: false }),
    evaluateRowActionRule: () => true,
    resolveDmsComponent: () => undefined,
    Color: { error: "error", success: "success" },
    CONTENT_LANGUAGE_HEADER: "x-content-language",
    AccessMode: { ReadOnly: 1, WriteOnly: 2, ReadWrite: 3 },
    useDmsAsyncData: async (_key: string, read: () => Promise<unknown>) => {
      const data = ref(await read());
      return { data, status: ref("success"), refresh: vi.fn() };
    },
  })) {
    vi.stubGlobal(name, value);
  }
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

async function mountBoard() {
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
            columns: [STAGE_COLUMN, LOST_REASON_COLUMN],
            baseQuery: {},
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

describe("a card dropped on a column the server refuses", () => {
  it("names the missing field by its column's label", async () => {
    await mountBoard();
    // The board's columns in order: lead, then lost.
    expect(changeHandlers).toHaveLength(2);
    changeHandlers[1]!({ added: { element: { ...DEAL } } });
    await flushPromises();
    await flushPromises();

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "error",
        title: "dms.table.kanban.move_error",
        description: "Loss reason est obligatoire.",
      }),
    );
  });
});
