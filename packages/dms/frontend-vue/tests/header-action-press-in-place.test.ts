// @vitest-environment jsdom
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
} from "vue";
import {
  registerQuickActionTarget,
  runMountedQuickAction,
} from "../layers/dms-ui/app/build/utils/quickActionTargets";

const handleCustomButton = vi.fn();
vi.mock("#dms-ui/app/build/composables/actions/useActionTargets", () => ({
  useActionTargets: () => ({ handleCustomButton }),
}));

vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    isHeaderActionHidden: () => false,
    session: ref(null),
  }),
}));

const MEMBERS_PATH = "/settings/workspace/members";
const TABLE_ID = "table";
const INVITE = "invite";

// The members page as the backend serves it: the table view's "invite"
// button, placed in the header, which opens the invite modal.
const INVITE_HEADER_ACTION = {
  id: `${TABLE_ID}:${INVITE}`,
  componentId: TABLE_ID,
  buttonId: INVITE,
  label: "Invite members",
  color: "primary" as const,
};

const ButtonStub = defineComponent({
  props: { label: String, disabled: Boolean, onClick: Function, to: String },
  setup: (props) => () =>
    h(
      "button",
      {
        disabled: props.disabled,
        "data-to": props.to,
        onClick: () => props.onClick?.(),
      },
      props.label,
    ),
});

let app: App | undefined;
let host: HTMLDivElement;
const routerReplace = vi.fn(() => Promise.resolve());

beforeEach(() => {
  routerReplace.mockClear();
  handleCustomButton.mockClear();
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () =>
    reactive({ path: MEMBERS_PATH, query: {} }),
  );
  vi.stubGlobal("useDmsRouter", () => ({ replace: routerReplace }));
  vi.stubGlobal("useSiteLayout", () => ({
    quickActions: ref(null),
    findMatchingRoute: () => ({ metadata: { layoutUrl: MEMBERS_PATH } }),
    pageLayouts: ref({
      [MEMBERS_PATH]: {
        components: {
          [TABLE_ID]: { options: { customButtons: [{ id: INVITE }] } },
        },
      },
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

async function mountHeaderBar(actions: unknown[] = [INVITE_HEADER_ACTION]) {
  const { default: PageHeaderActionBar } = await import(
    "../layers/dms-layout/app/build/components/layout/PageHeaderActionBar.vue"
  );
  app = createApp({
    render: () => h(PageHeaderActionBar, { actions }),
  });
  app.component("UButton", ButtonStub);
  app.component(
    "UTooltip",
    defineComponent(
      (_, { slots }) =>
        () =>
          slots.default?.(),
    ),
  );
  app.mount(host);
  await nextTick();
  const button = host.querySelector("button");
  if (!button) throw new Error("the header action did not render");
  return button;
}

describe("a header action pressing a table view button", () => {
  it("presses the mounted table view in place, on the click, without a server visit", async () => {
    const run = vi.fn();
    const unregister = registerQuickActionTarget({
      path: MEMBERS_PATH,
      componentId: TABLE_ID,
      run,
    });
    try {
      const button = await mountHeaderBar();
      button.click();

      // Routed through the URL, the modal opened two server visits later,
      // and over the next page when the user navigated meanwhile.
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith({ kind: "button", button: INVITE });
      expect(routerReplace).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("falls back to the URL when the table view is not mounted", async () => {
    const button = await mountHeaderBar();
    button.click();

    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith({
      query: {
        quickAction: "button",
        quickActionComponent: TABLE_ID,
        quickActionButton: INVITE,
      },
    });
  });
});

describe("header buttons", () => {
  it("presses a table view's add placed in the header", async () => {
    const run = vi.fn();
    const unregister = registerQuickActionTarget({
      path: MEMBERS_PATH,
      componentId: TABLE_ID,
      run,
    });
    try {
      const button = await mountHeaderBar([
        { id: `${TABLE_ID}:add`, componentId: TABLE_ID, label: "New" },
      ]);
      button.click();
      expect(run).toHaveBeenCalledWith({ kind: "add" });
    } finally {
      unregister();
    }
  });

  it("runs a declared button's target as a toolbar button", async () => {
    const purge = {
      id: "purge",
      label: "Purge",
      target: { type: "api", url: "/api/purge", successMessage: "Done" },
      confirm: { title: "Purge?" },
    };
    const button = await mountHeaderBar([purge]);
    button.click();
    expect(handleCustomButton).toHaveBeenCalledWith(purge);
  });

  it("draws a page target as a link", async () => {
    const button = await mountHeaderBar([
      { id: "docs", label: "Docs", target: { type: "page", url: "/docs" } },
    ]);
    expect(button.dataset.to).toBe("/docs");
  });

  it("leaves out a quick action the user is not served", async () => {
    await expect(
      mountHeaderBar([
        {
          id: "new",
          label: "",
          target: { type: "quickAction", id: "billing:new-invoice" },
        },
      ]),
    ).rejects.toThrow(/did not render/);
  });
});

describe("runMountedQuickAction", () => {
  const intent = { kind: "button", button: INVITE } as const;

  it("only answers for the table view of that page", () => {
    const run = vi.fn();
    const unregister = registerQuickActionTarget({
      path: MEMBERS_PATH,
      componentId: TABLE_ID,
      run,
    });

    expect(
      runMountedQuickAction("/settings/workspace/roles", TABLE_ID, intent),
    ).toBe(false);
    expect(runMountedQuickAction(MEMBERS_PATH, "other", intent)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(runMountedQuickAction(MEMBERS_PATH, TABLE_ID, intent)).toBe(true);
    expect(run).toHaveBeenCalledOnce();

    unregister();
    expect(runMountedQuickAction(MEMBERS_PATH, TABLE_ID, intent)).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });
});
