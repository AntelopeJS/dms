// @vitest-environment jsdom
/**
 * A cards display whose custom card loads lazily keeps its skeleton until the
 * card's code is there, and the code of the components the card draws: an
 * empty grid would lift the pagination footer for a beat, then drop it when
 * the cards land.
 */
import {
  computed,
  createApp,
  defineAsyncComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import type { TableViewDisplayContext } from "../layers/dms-ui/app/composables/table-view/types/display";

vi.mock("../layers/dms-ui/app/build/components/table/Pagination.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../layers/dms-ui/app/build/components/table/Empty.vue", () => ({
  default: { render: () => null },
}));

const SiteCard = {
  props: { rowId: String },
  setup: (props: { rowId?: string }) => () => h("article", props.rowId),
};

let resolveCard: (component: typeof SiteCard) => void = () => {};
let lazyCard: ReturnType<typeof defineAsyncComponent>;
let resolveRecordCard: ((component: typeof SiteCard) => void) | undefined;

// A custom card drawn through a component that loads lazily in turn (the
// DMS record card).
let lazyRecord: ReturnType<typeof defineAsyncComponent>;
const RecordSiteCard = {
  props: { rowId: String },
  setup: (props: { rowId?: string }) => () =>
    h(lazyRecord, { rowId: props.rowId }),
};

let app: App | undefined;
let container: HTMLElement;

function mount() {
  const context = reactive({
    items: [{ _id: "s0" }, { _id: "s1" }],
    columns: [],
    loading: false,
    firstPageLoading: false,
    rowIdKey: "_id",
    labelKey: "name",
    options: { card: { component: { componentName: "SiteCard" } } },
    pagination: { pageIndex: 0, pageSize: 3, total: 2 },
    selection: { isSelected: () => false, toggle: () => {} },
    actions: { canAdd: false, open: () => {} },
  }) as unknown as TableViewDisplayContext;
  app = createApp({ render: () => h(CardsDisplay, { context }) });
  app.component("USkeleton", {
    render: () => h("span", { "data-test": "skeleton" }),
  });
  container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
}

const skeletons = () => container.querySelectorAll('[data-test="skeleton"]');
const cards = () => container.querySelectorAll("article");

beforeEach(() => {
  resolveRecordCard = undefined;
  lazyRecord = defineAsyncComponent(
    () =>
      new Promise<typeof SiteCard>((resolve) => (resolveRecordCard = resolve)),
  );
  lazyCard = defineAsyncComponent(
    () => new Promise<typeof SiteCard>((resolve) => (resolveCard = resolve)),
  );
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("h", h);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en"), t: (t: string) => t }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  vi.stubGlobal("resolveDmsComponent", (name: string) =>
    name === "SiteCard" ? lazyCard : undefined,
  );
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  container.remove();
  vi.unstubAllGlobals();
});

it("keeps the skeleton while the custom card's code loads", async () => {
  mount();
  await nextTick();
  expect(skeletons().length).toBeGreaterThan(0);
  expect(cards()).toHaveLength(0);

  resolveCard(SiteCard);
  await vi.waitFor(() => expect(cards()).toHaveLength(2));
  expect(skeletons()).toHaveLength(0);
});

it("draws the cards at once when the card's code is already there", async () => {
  mount();
  resolveCard(SiteCard);
  await vi.waitFor(() => expect(cards()).toHaveLength(2));
  app!.unmount();
  container.remove();

  mount();
  await nextTick();
  expect(cards()).toHaveLength(2);
  expect(skeletons()).toHaveLength(0);
});

it("keeps the skeleton while a component the card draws loads", async () => {
  mount();
  resolveCard(RecordSiteCard as typeof SiteCard);
  // The card is in and draws its record card, still on its way.
  await vi.waitFor(() => expect(resolveRecordCard).toBeDefined());
  await nextTick();
  expect(skeletons().length).toBeGreaterThan(0);
  expect(cards()).toHaveLength(0);

  resolveRecordCard!(SiteCard);
  await vi.waitFor(() => expect(cards()).toHaveLength(2));
  expect(skeletons()).toHaveLength(0);
});
