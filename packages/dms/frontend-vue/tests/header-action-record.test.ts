// @vitest-environment jsdom
/**
 * A page header's buttons acting on the record the page shows (the layout's
 * `record`): a target reads the record's fields as `{{record.X}}`, and a
 * button bound to the record waits for it, then disappears from a page whose
 * record is not found.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type FunctionalComponent,
} from "vue";
import {
  fillRecordTokens,
  isRecordBound,
  withPageRecord,
} from "../layers/dms-layout/app/utils/pageRecord";
import { useApiData } from "../layers/dms-core/app/composables/auth/useApiData";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";

vi.mock("#dms-ui/app/build/composables/actions/useActionTargets", () => ({
  useActionTargets: () => ({ handleCustomButton: vi.fn() }),
}));
vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    isHeaderActionHidden: () => false,
    session: ref(null),
  }),
}));

const route = reactive<{ path: string; query: Record<string, unknown> }>({
  path: "/sites/s1",
  query: {},
});
const authFetch = vi.fn();

const ButtonStub = defineComponent({
  props: { label: String, disabled: Boolean, to: String },
  setup: (props) => () =>
    h("button", { disabled: props.disabled, "data-to": props.to }, props.label),
});
const SlotStub: FunctionalComponent = (_, { slots }) => slots.default?.();

const MAPS = {
  id: "maps",
  label: "Directions",
  target: {
    type: "external",
    url: "https://maps.example.com/?q={{record.address}}",
  },
};
const EDIT = {
  id: "edit",
  label: "Edit",
  requiresRecord: true,
  target: { type: "page", url: "/sites/{{params.id}}/edit" },
};
const HELP = {
  id: "help",
  label: "Help",
  target: { type: "page", url: "/help" },
};
const RECORD = { fetchUrl: "/api/sites/get?id={{params.id}}" };

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  authFetch.mockReset();
  stubApiData(authFetch);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({ replace: vi.fn() }));
  vi.stubGlobal("useSiteLayout", () => ({
    quickActions: ref(null),
    findMatchingRoute: () => ({ metadata: {}, params: { id: "s1" } }),
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

// A block of the page reading the record's URL as `useChartFetch` does.
const RecordBlock = defineComponent({
  setup() {
    useApiData("/api/sites/get?id=s1", { lazy: true });
    return () => null;
  },
});

async function mountOutlet(
  record: typeof RECORD | undefined,
  withBlock = false,
) {
  const { default: Outlet } = await import(
    "../layers/dms-layout/app/build/components/layout/PageHeaderActionsOutlet.vue"
  );
  app = createApp({
    render: () => [
      h(Outlet, { actions: [MAPS, EDIT, HELP], record }),
      withBlock ? h(RecordBlock) : null,
    ],
  });
  browserRuntime(app);
  app.component("UButton", ButtonStub);
  app.component("UTooltip", SlotStub);
  app.mount(host);
  await nextTick();
}

const buttons = () =>
  [...host.querySelectorAll("button")].map((button) => ({
    label: button.textContent,
    disabled: button.disabled,
    to: button.dataset.to,
  }));

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
};

describe("header buttons acting on the page's record", () => {
  it("are disabled while the record loads, then read its fields", async () => {
    let answer!: (values: unknown) => void;
    authFetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await mountOutlet(RECORD);
    expect(authFetch).toHaveBeenCalledWith(
      "/api/sites/get?id=s1",
      expect.anything(),
    );
    expect(buttons().map((button) => button.disabled)).toEqual([
      true,
      true,
      false,
    ]);

    answer({ address: "1 Main St, Liège" });
    await settle();
    expect(buttons()).toEqual([
      {
        label: "Directions",
        disabled: false,
        to: "https://maps.example.com/?q=1%20Main%20St%2C%20Li%C3%A8ge",
      },
      { label: "Edit", disabled: false, to: "/sites/s1/edit" },
      { label: "Help", disabled: false, to: "/help" },
    ]);
  });

  it("are left out of a page whose record is not found", async () => {
    authFetch.mockRejectedValue(
      Object.assign(new Error("Not Found"), { statusCode: 404 }),
    );
    await mountOutlet(RECORD);
    await settle();
    expect(buttons().map((button) => button.label)).toEqual(["Help"]);
  });

  it("share one read with a block of the page reading the same record", async () => {
    authFetch.mockResolvedValue({ address: "1 Main St" });
    await mountOutlet(RECORD, true);
    await settle();
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(buttons().map((button) => button.disabled)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("are left alone on a page declaring no record", async () => {
    await mountOutlet(undefined);
    expect(authFetch).not.toHaveBeenCalled();
    expect(buttons().map((button) => button.label)).toEqual([
      "Directions",
      "Edit",
      "Help",
    ]);
  });
});

describe("page record tokens", () => {
  it("binds a button naming the record, or declaring it", () => {
    expect(isRecordBound(MAPS as never)).toBe(true);
    expect(isRecordBound(EDIT as never)).toBe(true);
    expect(isRecordBound(HELP as never)).toBe(false);
  });

  it("leaves a token the record has no value for as written", () => {
    expect(
      fillRecordTokens("/x?a={{record.a}}&b={{ record.b.c }}", { b: { c: 2 } }),
    ).toBe("/x?a={{record.a}}&b=2");
  });

  it("keeps a button of a page without a record", () => {
    expect(withPageRecord(HELP as never, undefined)).toBe(HELP);
  });
});
