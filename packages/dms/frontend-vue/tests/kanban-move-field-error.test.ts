/**
 * A card dropped on a column the server refuses (a deal moved to "Lost"
 * without its mandatory reason, or a read-only demo) toasts the refusal as a
 * warning and goes back to its column.
 *
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./helpers/table-runtime";
import { useRealDataEngine } from "./fixtures/dataEngine";
import Sortable from "sortablejs";
import {
  readOnlyFailure,
  installReadOnlyRefusal,
} from "./helpers/read-only-refusal";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";
import {
  type App,
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
import { defined } from "./helpers/defined";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));

const DEAL = { _id: "d1", stage: "lead", lostReason: null };

const STAGE_COLUMN: TableViewColumn = {
  id: "stage",
  accessorKey: "stage",
  header: "Stage",
  listable: true,
  type: {
    id: "select",
    compareModes: [],
    filterComponents: {},
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
const LOST_REASON_COLUMN: TableViewColumn = {
  id: "lostReason",
  accessorKey: "lostReason",
  header: "Loss reason",
  listable: true,
  type: {
    id: "select",
    compareModes: [],
    filterComponents: {},
    inputComponent: {},
  },
};

const refusal = Object.assign(
  new Error('[PUT] "/deals/edit?id=d1": 400 Bad Request'),
  {
    name: "FetchError",
    statusCode: 400,
    data: { code: "missing_mandatory_fields", fields: ["lostReason"] },
  },
);
let isReadOnly = false;

const authFetch = vi.fn(
  async (url: string, options: { query?: Record<string, string> } = {}) => {
    if (url.endsWith("/edit")) throw isReadOnly ? readOnlyFailure() : refusal;
    if (url.endsWith("/get")) return { ...DEAL };
    const stage = options.query?.filter_stage?.replace("is:", "");
    const results = stage === DEAL.stage ? [{ ...DEAL }] : [];
    return { results, total: results.length };
  },
);

const addToast = vi.fn(() => ({ id: "failure" }));

const translate = (
  key: string,
  params?: Parameters<
    (typeof import("../layers/dms-ui/app/entries/composables/confirm/confirmDialogTexts"))["resolveConfirmText"]
  >[1],
) =>
  key === "dms.field_errors.named_required"
    ? `${String(params?.field)} est obligatoire.`
    : key;

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubEnv("SSR", false);
  isReadOnly = false;
  addToast.mockClear();
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    h,
    inject,
    useAuthFetch: () => ({ $authFetch: authFetch }),
    useI18n: () => ({ locale: ref("fr"), t: translate }),
    useToast: () => ({ add: addToast }),
    resolveDmsComponent: () => undefined,
    Color: { error: "error", success: "success" },
    CONTENT_LANGUAGE_HEADER: "x-content-language",
    AccessMode: { ReadOnly: 1, WriteOnly: 2, ReadWrite: 3 },
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

async function mountBoard() {
  const { default: KanbanBoard } = await import(
    "../layers/dms-ui/app/components/table-view/KanbanBoard.vue"
  );
  app = createApp({
    render: () =>
      h(Suspense, null, {
        default: () =>
          h(KanbanBoard, {
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

/** The event Sortable hands its handlers for the card it drags. */
class CardDragEvent extends Event implements Sortable.SortableEvent {
  readonly clone: HTMLElement;
  readonly from: HTMLElement;
  readonly items: HTMLElement[];
  readonly target: HTMLElement;
  readonly to: HTMLElement;
  readonly oldDraggableIndex = undefined;
  readonly newDraggableIndex = undefined;
  readonly pullMode = undefined;
  readonly oldIndicies = [];
  readonly newIndicies = [];
  readonly swapItem = null;

  constructor(
    readonly item: HTMLElement,
    readonly oldIndex: number | undefined,
    readonly newIndex: number | undefined,
  ) {
    super("sortable");
    this.clone = item;
    this.from = item;
    this.items = [item];
    this.target = item;
    this.to = item;
  }
}

describe("a card dropped on a column the server refuses", () => {
  it.each([false, true])(
    "keeps the refusal visible and rolls back when read-only=%s",
    async (marked) => {
      isReadOnly = marked;
      if (marked) installReadOnlyRefusal();
      await mountBoard();
      const lists = [...host.querySelectorAll("div")]
        .map((element) => Sortable.get(element))
        .filter((list) => list !== undefined);
      expect(lists).toHaveLength(2);
      const [source, target] = lists;
      const item = defined(source).el.children[0];
      if (!(item instanceof HTMLElement))
        throw new Error("the board has no card");
      defined(defined(source).option("onStart"))(
        new CardDragEvent(item, 0, undefined),
      );
      defined(target).el.append(item);
      defined(defined(target).option("onAdd"))(
        new CardDragEvent(item, undefined, 0),
      );
      defined(defined(source).option("onRemove"))(
        new CardDragEvent(item, 0, undefined),
      );
      defined(defined(source).option("onEnd"))(
        new CardDragEvent(item, undefined, undefined),
      );
      await flushPromises();
      await flushPromises();

      const expected = marked
        ? { title: "error.read_only_demo", color: "warning" }
        : {
            color: "warning",
            title: "dms.action_error.fields",
          };
      expect(addToast).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining(expected),
      );
      expect(defined(source).el.children).toHaveLength(1);
      expect(defined(target).el.children).toHaveLength(0);
    },
  );
});
