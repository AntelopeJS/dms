// @vitest-environment jsdom
/**
 * A detail page's header driven by its record (`DefaultLayout({ header: {
 * fetchUrl } })`): the route answers who the record is — title, avatar,
 * status, badges, meta line — and the record its actions read. `when` hides
 * a button, `unavailableWhen` disables it with its reason, `menuGroup` puts
 * it in the "More actions" menu, and the header reads its record again after
 * an action (`refreshPageBlocks()`), the buttons following.
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
vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    isHeaderActionHidden: () => false,
    session: ref(null),
  }),
}));

const PATH = "/platform/workspaces/ws-1";
const HEADER_URL = "/api/workspaces/{{params.id}}/header";
const API = "/api/workspaces/{{params.id}}";

const ANSWER_DELAY_MS = 20;
let answer: Record<string, unknown>;
const requests: string[] = [];
const states = new Map<string, ReturnType<typeof ref>>();

function workspace(status: string) {
  return {
    title: "Acme Corp",
    avatar: { initials: "AC" },
    status: {
      label: `$status.${status}`,
      tone: status === "active" ? "success" : "error",
    },
    badges: [
      { label: "Business" },
      { label: "$complimentary", tone: "primary" },
    ],
    meta: [
      { value: "ws-1", mono: true },
      { label: "$owner", value: "Jane Doe" },
      { label: "$joined", tone: "success" },
    ],
    record: { status, stripeCustomerId: status === "active" ? "cus_1" : "" },
  };
}

// The header buttons of the workspace detail page: suspend or reactivate by
// status, a credit only for a Stripe customer, both in the menu.
const ACTIONS = [
  {
    id: "upgrade",
    label: "$change_plan",
    color: "primary",
    target: { type: "api", url: `${API}/upgrade`, successMessage: "$done" },
  },
  {
    id: "credit",
    label: "$grant_credit",
    menuGroup: "support",
    unavailableWhen: {
      field: "stripeCustomerId",
      truthy: false,
      reason: "$no_customer",
    },
    target: { type: "api", url: `${API}/credit`, successMessage: "$done" },
  },
  {
    id: "suspend",
    label: "$suspend",
    color: "error",
    menuGroup: "danger",
    when: { not: { field: "status", equals: "suspended" } },
    target: { type: "api", url: `${API}/suspend`, successMessage: "$done" },
    confirm: { from: `${API}/suspend/impact` },
  },
  {
    id: "reactivate",
    label: "$reactivate",
    menuGroup: "danger",
    when: { field: "status", equals: "suspended" },
    target: { type: "api", url: `${API}/reactivate`, successMessage: "$done" },
  },
];

const passThrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup:
      (_, { slots, attrs }) =>
      () =>
        h(tag, attrs, slots.default?.()),
  });

const ButtonStub = defineComponent({
  props: { label: String, disabled: Boolean, onClick: Function },
  setup: (props) => () =>
    h(
      "button",
      { disabled: props.disabled, onClick: () => props.onClick?.() },
      props.label,
    ),
});

interface MenuItemFixture {
  label?: string;
  description?: string;
  disabled?: boolean;
  onSelect?: () => void;
}

// The menu renders every entry, a group per list, so the test reads them.
const DropdownStub = defineComponent({
  props: { items: { type: Array, default: () => [] } },
  setup:
    (props, { slots }) =>
    () =>
      h("div", { "data-menu": "" }, [
        slots.default?.(),
        ...(props.items as MenuItemFixture[][]).map((group, index) =>
          h(
            "ul",
            { "data-group": index },
            group.map((item) =>
              h(
                "li",
                {
                  "data-disabled": item.disabled ? "" : undefined,
                  onClick: () => item.onSelect?.(),
                },
                [item.label, item.description ? ` — ${item.description}` : ""],
              ),
            ),
          ),
        ),
      ]),
});

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  answer = workspace("active");
  requests.length = 0;
  states.clear();
  handleCustomButton.mockClear();
  handleCustomRowAction.mockClear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: async (url: string) => {
      requests.push(url);
      const current = structuredClone(answer);
      await new Promise((resolve) => setTimeout(resolve, ANSWER_DELAY_MS));
      return current;
    },
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useApiError", vi.fn());
  vi.stubGlobal("useDmsRoute", () => reactive({ path: PATH, query: {} }));
  vi.stubGlobal("useDmsRouter", () => ({ replace: vi.fn() }));
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(initial()));
    return states.get(key);
  });
  vi.stubGlobal("useSiteLayout", () => ({
    quickActions: ref(null),
    findMatchingRoute: () => ({
      params: { id: "ws-1" },
      metadata: { fullId: "platform.workspaces.detail" },
    }),
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

// useChartFetch answers the first fetch at once, a refresh past 180ms.
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

async function mountHeader() {
  const { default: RecordPageHeader } = await import(
    "../layers/dms-layout/app/build/components/layout/RecordPageHeader.vue"
  );
  const { default: PageHeaderActionBar } = await import(
    "../layers/dms-layout/app/build/components/layout/PageHeaderActionBar.vue"
  );
  app = createApp({
    render: () =>
      h(
        RecordPageHeader,
        {
          source: { fetchUrl: HEADER_URL },
          icon: "i-ph-building",
          title: "$workspace_detail.title",
        },
        { actions: () => h(PageHeaderActionBar, { actions: ACTIONS }) },
      ),
  });
  app.component("UButton", ButtonStub);
  app.component("UDropdownMenu", DropdownStub);
  for (const name of ["UTooltip", "UIcon", "UAvatar", "USkeleton", "UBadge"]) {
    app.component(name, passThrough(name.toLowerCase()));
  }
  app.component(
    "UBadge",
    defineComponent({
      props: { label: String },
      setup: (props) => () => h("em", props.label),
    }),
  );
  app.component(
    "USkeleton",
    defineComponent(() => () => h("i", { "data-skeleton": "" })),
  );
  app.mount(host);
  await nextTick();
}

const text = (selector: string) =>
  [...host.querySelectorAll(selector)].map((node) => node.textContent?.trim());

const buttons = () =>
  [...host.querySelectorAll("button")].map((button) => ({
    label: button.textContent || button.getAttribute("aria-label"),
    disabled: button.disabled,
  }));

describe("a page header driven by its record", () => {
  it("shows placeholders, then who the record is", async () => {
    await mountHeader();
    expect(host.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);

    await settle();
    expect(requests).toEqual(["/api/workspaces/ws-1/header"]);
    expect(host.querySelector("[data-skeleton]")).toBeNull();
    expect(host.querySelector("h1")?.textContent?.trim()).toBe("Acme Corp");
    expect(host.textContent).toContain("AC");
    expect(host.textContent).toContain("$status.active");
    expect(text("em")).toEqual(["Business", "$complimentary"]);
    expect(host.textContent).toContain("ws-1");
    expect(host.textContent).toContain("Jane Doe");
  });

  it("publishes the record to the page and its title to the breadcrumb", async () => {
    await mountHeader();
    await settle();
    expect(states.get("dms-page-record")?.value).toMatchObject({
      path: PATH,
      record: { status: "active", stripeCustomerId: "cus_1" },
      isLoading: false,
    });
    expect(states.get("dms-page-record-label")?.value).toEqual({
      path: PATH,
      label: "Acme Corp",
    });
  });

  it("keeps the page's own title when the route fails", async () => {
    vi.stubGlobal("useAuthFetch", () => ({
      $authFetch: async () => {
        throw new Error("down");
      },
    }));
    await mountHeader();
    await settle();
    expect(host.querySelector("h1")?.textContent?.trim()).toBe(
      "$workspace_detail.title",
    );
  });
});

describe("the actions of a record's header", () => {
  it("draws the buttons and the menu groups the record allows", async () => {
    await mountHeader();
    await settle();
    expect(buttons().map((button) => button.label)).toEqual([
      "$change_plan",
      "header.more_actions",
    ]);
    expect(text("[data-group='0'] li")).toEqual(["$grant_credit"]);
    expect(text("[data-group='1'] li")).toEqual(["$suspend"]);
  });

  it("disables an action its condition refuses, with the reason", async () => {
    answer = workspace("suspended");
    await mountHeader();
    await settle();
    const [credit] = host.querySelectorAll("[data-group='0'] li");
    expect(credit?.hasAttribute("data-disabled")).toBe(true);
    expect(credit?.textContent).toBe("$grant_credit — $no_customer");
    expect(text("[data-group='1'] li")).toEqual(["$reactivate"]);
  });

  it("runs an action on the record, its route tokens filled", async () => {
    await mountHeader();
    await settle();
    (host.querySelector("[data-group='1'] li") as HTMLElement).click();
    expect(handleCustomRowAction).toHaveBeenCalledOnce();
    const [action, row] = handleCustomRowAction.mock.calls[0]!;
    expect(action.target.url).toBe("/api/workspaces/ws-1/suspend");
    expect(action.confirm).toEqual({
      from: "/api/workspaces/ws-1/suspend/impact",
    });
    expect(row).toEqual({ status: "active", stripeCustomerId: "cus_1" });
  });

  it("reads the record again after an action, the buttons following", async () => {
    await mountHeader();
    await settle();
    expect(text("[data-group='1'] li")).toEqual(["$suspend"]);

    answer = workspace("suspended");
    refreshPageBlocks();
    // Kept on screen until the answer lands: no placeholder in between.
    expect(host.querySelector("[data-skeleton]")).toBeNull();
    await settle();
    await nextTick();

    expect(requests).toEqual([
      "/api/workspaces/ws-1/header",
      "/api/workspaces/ws-1/header",
    ]);
    expect(host.textContent).toContain("$status.suspended");
    expect(text("[data-group='1'] li")).toEqual(["$reactivate"]);
  });
});
