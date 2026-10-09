// @vitest-environment jsdom
/**
 * The `ActionList` block: one row per action on the record a page shows,
 * with its icon, label and description. `when` hides a row,
 * `unavailableWhen` disables it with its reason in place of its description,
 * a row runs its target on the record, and the list reads its record again
 * after an action. Without `fetchUrl` it reads the page header's record.
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

const handleCustomButton = vi.fn();
const handleCustomRowAction = vi.fn();
vi.mock("#dms-ui/app/build/composables/actions/useActionTargets", () => ({
  useActionTargets: () => ({ handleCustomButton, handleCustomRowAction }),
}));

const PATH = "/platform/workspaces/ws-1";
const API = "/api/workspaces/{{params.id}}";

let answer: Record<string, unknown>;
const requests: string[] = [];
const states = new Map<string, ReturnType<typeof ref>>();

// The operator card of the workspace detail page.
const OPERATOR_ACTIONS = [
  {
    id: "upgrade",
    label: "$upgrade",
    description: "$upgrade_description",
    icon: "i-ph-arrow-circle-up",
    unavailableWhen: {
      field: "billed",
      truthy: false,
      reason: "$upgrade_unavailable",
    },
    target: {
      type: "modal",
      component: { componentName: "dms-form" },
    },
  },
  {
    id: "join",
    label: "$join",
    description: "$join_description",
    icon: "i-ph-user-plus",
    when: { field: "joinedAt", truthy: false },
    target: { type: "api", url: `${API}/join`, successMessage: "$joined" },
  },
  {
    id: "delete",
    label: "$delete",
    icon: "i-ph-trash",
    color: "error",
    target: { type: "api", url: `${API}/delete`, successMessage: "$deleted" },
    confirm: { from: `${API}/delete/impact` },
  },
];

const passThrough = (tag: string) =>
  defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h(tag, slots.default?.()),
  });

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  answer = { billed: false, joinedAt: null };
  requests.length = 0;
  states.clear();
  handleCustomButton.mockClear();
  handleCustomRowAction.mockClear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: async (url: string) => {
      requests.push(url);
      return structuredClone(answer);
    },
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useApiError", vi.fn());
  vi.stubGlobal("useDmsRoute", () => reactive({ path: PATH, query: {} }));
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(initial()));
    return states.get(key);
  });
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

async function mountList(options: Record<string, unknown>) {
  const { default: ActionListBlock } = await import(
    "../layers/dms-ui/app/components/blocks/ActionListBlock.vue"
  );
  app = createApp({
    render: () =>
      h(ActionListBlock, {
        componentId: "operator",
        pageId: "platform.workspaces.detail",
        routeParams: { id: "ws-1" },
        title: "$operator.title",
        actions: OPERATOR_ACTIONS,
        ...options,
      }),
  });
  for (const name of ["UIcon", "UButton"]) {
    app.component(name, passThrough(name.toLowerCase()));
  }
  app.component(
    "USkeleton",
    defineComponent(() => () => h("i", { "data-skeleton": "" })),
  );
  app.component("DmsEmptyState", passThrough("section"));
  app.mount(host);
  await nextTick();
}

function rows() {
  return [
    ...host.querySelectorAll<HTMLButtonElement>("button[data-action]"),
  ].map((row) => ({
    key: row.dataset.action,
    disabled: row.disabled,
    text: row.textContent?.replace(/\s+/g, " ").trim(),
  }));
}

describe("an ActionList block", () => {
  it("lists the actions its record allows, a disabled one with its reason", async () => {
    await mountList({ fetchUrl: `${API}/operator` });
    await settle();

    expect(requests).toEqual(["/api/workspaces/ws-1/operator"]);
    expect(host.textContent).toContain("$operator.title");
    expect(rows()).toEqual([
      { key: "upgrade", disabled: true, text: "$upgrade$upgrade_unavailable" },
      { key: "join", disabled: false, text: "$join$join_description" },
      { key: "delete", disabled: false, text: "$delete" },
    ]);
  });

  it("runs a row's target on the record, its route tokens filled", async () => {
    await mountList({ fetchUrl: `${API}/operator` });
    await settle();
    host.querySelector<HTMLButtonElement>("[data-action='delete']")?.click();

    expect(handleCustomRowAction).toHaveBeenCalledOnce();
    const [action, row] = handleCustomRowAction.mock.calls[0]!;
    expect(action.target.url).toBe("/api/workspaces/ws-1/delete");
    expect(action.confirm).toEqual({
      from: "/api/workspaces/ws-1/delete/impact",
    });
    expect(row).toEqual({ billed: false, joinedAt: null });
  });

  it("does not run a disabled row", async () => {
    await mountList({ fetchUrl: `${API}/operator` });
    await settle();
    host.querySelector<HTMLButtonElement>("[data-action='upgrade']")?.click();
    expect(handleCustomRowAction).not.toHaveBeenCalled();
  });

  it("reads its record again after an action, its rows following", async () => {
    await mountList({ fetchUrl: `${API}/operator` });
    await settle();

    answer = { billed: true, joinedAt: "2026-10-01" };
    refreshPageBlocks();
    await settle();
    await nextTick();

    expect(requests).toHaveLength(2);
    expect(rows().map((row) => [row.key, row.disabled])).toEqual([
      ["upgrade", false],
      ["delete", false],
    ]);
  });

  it("reads the page header's record without a route of its own", async () => {
    states.set(
      "dms-page-record",
      ref({
        path: PATH,
        record: { billed: true, joinedAt: null },
        isLoading: false,
        hasError: false,
      }),
    );
    await mountList({});
    await settle();

    expect(requests).toEqual([]);
    expect(rows().map((row) => [row.key, row.disabled])).toEqual([
      ["upgrade", false],
      ["join", false],
      ["delete", false],
    ]);
  });

  it("shows placeholders while the page's record loads", async () => {
    states.set(
      "dms-page-record",
      ref({ path: PATH, record: null, isLoading: true, hasError: false }),
    );
    await mountList({});
    expect(host.querySelectorAll("[data-skeleton]")).toHaveLength(3);
    expect(rows()).toEqual([]);
  });
});
