// @vitest-environment jsdom
/**
 * A data block whose source answers 404 shows what it reads does not exist:
 * a translated not-found state (the server's message or `emptyState` over
 * it), never "Check your connection" with a retry, and never the values it
 * showed for the record it read before.
 */
import {
  type Component,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { readFetchNotFound } from "../layers/dms-ui/app/build/utils/fetchNotFound";

interface FetchFailure extends Error {
  statusCode?: number;
  data?: unknown;
}

const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
const answers = new Map<string, unknown>();

function failure(statusCode: number, data?: unknown): FetchFailure {
  return Object.assign(new Error(`${statusCode}`), {
    name: "FetchError",
    statusCode,
    data,
  });
}

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    const answer = answers.get(url);
    if (answer instanceof Error) throw answer;
    return answer;
  },
}));
vi.stubGlobal("useDmsRoute", () => route);

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);

const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);
const { useBlockItems } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useBlockItems"
);
const { default: BlockStatus } = await import(
  "../layers/dms-ui/app/build/components/blocks/BlockStatus.vue"
);

// useChartFetch debounces every refresh past the first by 180ms.
const SETTLE_MS = 250;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
const URL = "/api/kpis?workspace={{query.workspace}}";

const mounted: Array<{ unmount: () => void }> = [];

// Runs a composable inside a component's setup.
const Probe = defineComponent({
  props: { run: { type: Function, required: true } },
  setup(props) {
    props.run();
    return () => h("div");
  },
});

const probe = (run: () => void) => mount({ render: () => h(Probe, { run }) });

function mount(component: Component): HTMLElement {
  const app = createApp(component);
  for (const name of ["UIcon", "UButton", "DmsLink"]) {
    app.component(name, (props: Record<string, unknown>) =>
      h("i", { "data-stub": name, "data-label": props.label }),
    );
  }
  const host = document.createElement("div");
  app.mount(host);
  mounted.push(app);
  return host;
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  answers.clear();
  route.query = { workspace: "web" };
  answers.set("/api/kpis?workspace=web", { items: [{ label: "web" }] });
  answers.set(
    "/api/kpis?workspace=gone",
    failure(404, { code: "unknown_workspace", message: "No such workspace" }),
  );
  answers.set("/api/kpis?workspace=down", failure(500));
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => `t(${key})`,
    locale: ref("en"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => (text.startsWith("$") ? `t(${text})` : text),
  }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

async function switchWorkspace(workspace: string) {
  route.query = { workspace };
  await nextTick();
  await settle();
}

describe("readFetchNotFound", () => {
  it("reads a 404's message and emptyState", () => {
    expect(
      readFetchNotFound(
        failure(404, { message: "Gone", emptyState: { title: "$x.y" } }),
      ),
    ).toEqual({ message: "Gone", emptyState: { title: "$x.y" } });
  });

  it("is null for any other failure", () => {
    expect(readFetchNotFound(failure(500))).toBeNull();
    expect(readFetchNotFound(new TypeError("Failed to fetch"))).toBeNull();
    expect(readFetchNotFound(null)).toBeNull();
  });
});

describe("useChartFetch on a 404", () => {
  function mountFetch() {
    const state: Partial<ReturnType<typeof useChartFetch<unknown>>> = {};
    probe(() =>
      Object.assign(state, useChartFetch<unknown>({ fetchUrl: URL })),
    );
    return state;
  }

  it("drops the values of the record it read before", async () => {
    const state = mountFetch();
    await settle();
    expect(state.data?.value).toEqual({ items: [{ label: "web" }] });
    await switchWorkspace("gone");
    expect(state.data?.value).toBeNull();
    expect(readFetchNotFound(state.error?.value)?.message).toBe(
      "No such workspace",
    );
  });

  it("keeps them when a read of the same request fails otherwise", async () => {
    const state = mountFetch();
    await settle();
    answers.set("/api/kpis?workspace=web", failure(500));
    await state.refresh?.();
    await settle();
    expect(state.data?.value).toEqual({ items: [{ label: "web" }] });
  });

  it("never shows a record's values for another request that failed", async () => {
    // They belong to another workspace: the card shows its failure instead.
    const state = mountFetch();
    await settle();
    await switchWorkspace("down");
    expect(state.data?.value).toBeNull();
    expect(state.error?.value).toBeTruthy();
  });
});

describe("useBlockItems on a 404", () => {
  it("reports not found, not a load error, and lists nothing", async () => {
    const state: Partial<ReturnType<typeof useBlockItems<unknown>>> = {};
    probe(() =>
      Object.assign(
        state,
        useBlockItems<unknown>({ items: () => [], fetchUrl: URL }),
      ),
    );
    await settle();
    await switchWorkspace("gone");
    expect(state.items?.value).toEqual([]);
    expect(state.hasError?.value).toBe(false);
    expect(state.notFound?.value?.message).toBe("No such workspace");
    // Nothing left on screen to keep: the next failure is a load error.
    await switchWorkspace("down");
    expect(state.notFound?.value).toBeNull();
    expect(state.hasError?.value).toBe(true);
  });
});

describe("BlockStatus not-found", () => {
  const render = (notFound: unknown) =>
    mount({
      render: () => h(BlockStatus, { state: "not-found", notFound }),
    }).textContent;

  it("says so in the user's language, with no retry", () => {
    const text = render({});
    expect(text).toContain("t(dms.blocks.not_found)");
    expect(text).toContain("t(dms.blocks.not_found_hint)");
    expect(text).not.toContain("load_error");
  });

  it("describes it with the server's message", () => {
    expect(render({ message: "No such workspace" })).toContain(
      "No such workspace",
    );
  });

  it("lays the server's emptyState over it", () => {
    const text = render({
      message: "No such workspace",
      emptyState: {
        title: "$lang.unknown_title",
        description: "$lang.unknown_hint",
      },
    });
    expect(text).toContain("t($lang.unknown_title)");
    expect(text).toContain("t($lang.unknown_hint)");
    expect(text).not.toContain("No such workspace");
  });
});
