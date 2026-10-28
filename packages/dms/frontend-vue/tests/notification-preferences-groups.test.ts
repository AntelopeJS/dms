// @vitest-environment jsdom
import {
  computed,
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  type App,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationPreferencesForm from "../layers/dms-layout/app/build/components/pages/settings/notification/NotificationPreferencesForm.vue";
import { NOTIFICATION_GROUP_STORAGE_PREFIX } from "../layers/dms-layout/app/build/composables/notification/useNotificationGroupsOpen";
import {
  browserRuntime,
  engine,
  stubApiData,
} from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const categories = [
  { id: "system", labelKey: "System", icon: "i-ph-gear" },
  { id: "security", labelKey: "Security", icon: "i-ph-shield" },
];
const authFetch = vi.fn(async (url: string) =>
  url.endsWith("/categories")
    ? {
        categories,
        subjects: [
          { id: "general", category: { id: "system" }, labelKey: "General" },
          { id: "account", category: { id: "system" }, labelKey: "Account" },
          {
            id: "alerts",
            category: { id: "security" },
            labelKey: "Security alerts",
          },
        ],
      }
    : {},
);

let app: App | undefined;
let runtime: ReturnType<typeof engine.createDmsFrontendRuntime>;

function createFormApp(create: typeof createApp): App {
  const formApp = create(
    defineComponent({
      setup: () => () => h(NotificationPreferencesForm as Component),
    }),
  );
  if (create === createSSRApp) {
    runtime = engine.createDmsFrontendRuntime(
      undefined,
      {},
      import.meta.env.SSR,
    );
    engine.provideDmsFrontendRuntime(formApp, runtime);
  } else runtime = browserRuntime(formApp);
  const passThrough = defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        h("div", [slots.default?.(), slots.footer?.()]),
  });
  for (const [name, stub] of Object.entries({
    DmsSection: passThrough,
    DmsEmptyState: passThrough,
    DmsIconWell: defineComponent({ render: () => h("span") }),
    UBadge: defineComponent({ render: () => h("span") }),
    UIcon: defineComponent({ render: () => h("span") }),
    // Attributes (aria-*) fall through to the native button.
    UButton: defineComponent({
      props: { label: String, icon: String },
      emits: ["click"],
      setup:
        (props, { emit }) =>
        () =>
          h(
            "button",
            {
              type: "button",
              "data-icon": props.icon,
              onClick: () => emit("click"),
            },
            props.label,
          ),
    }),
    USwitch: defineComponent({
      props: { modelValue: Boolean, disabled: Boolean },
      emits: ["update:modelValue"],
      setup:
        (props, { emit }) =>
        () =>
          h("button", {
            type: "button",
            role: "switch",
            "aria-checked": String(props.modelValue),
            onClick: () => emit("update:modelValue", !props.modelValue),
          }),
    }),
    // Shows its content while open, as Reka's collapsible does.
    UCollapsible: defineComponent({
      props: { open: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          h("div", props.open ? slots.content?.() : []),
    }),
  })) {
    formApp.component(name, stub);
  }
  return formApp;
}

async function mount() {
  app = createFormApp(createApp);
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  await vi.waitFor(() => expect(chevronOf(container, "system")).toBeTruthy());
  return container;
}

/**
 * Renders the form on the "server", runs what only the browser holds, then
 * hydrates the server markup.
 */
async function hydrate(runOnClient: () => void) {
  const container = document.createElement("div");
  vi.stubEnv("SSR", true);
  container.innerHTML = await renderToString(createFormApp(createSSRApp));
  const payload = structuredClone(engine.serializeDmsPayload(runtime));
  vi.stubEnv("SSR", false);
  document.body.append(container);
  runOnClient();
  app = createFormApp(createSSRApp);
  engine.restoreDmsPayload(runtime, payload);
  app.mount(container);
  return container;
}

const chevronOf = (container: HTMLElement, categoryId: string) =>
  container.querySelector<HTMLButtonElement>(
    `button[aria-controls="notification-category-subjects-${categoryId}"]`,
  )!;

const subjectNames = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="rowgroup"] [role="rowheader"]')].map(
    (cell) => cell.textContent?.trim(),
  );

const rowOf = (container: HTMLElement, categoryId: string) =>
  chevronOf(container, categoryId).closest<HTMLElement>('[role="row"]')!;

beforeEach(() => {
  installAuthSettingsRuntime();
  stubApiData(authFetch);
  localStorage.clear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.name ? `${key}:${String(params.name)}` : key,
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("notification preferences groups", () => {
  it("starts every group folded, with its count on the group row", async () => {
    const container = await mount();

    expect(subjectNames(container)).toEqual([]);
    const chevron = chevronOf(container, "system");
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(chevron.getAttribute("aria-label")).toBe(
      "page.settings.notifications.category_expand:System",
    );
    expect(chevron.dataset.icon).toBe("i-ph-caret-right");
    expect(rowOf(container, "system").textContent).toContain(
      "page.settings.notifications.category_count",
    );
  });

  it("unfolds and folds a group's subjects from its chevron", async () => {
    const container = await mount();
    const chevron = chevronOf(container, "system");

    chevron.click();
    await nextTick();
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(chevron.dataset.icon).toBe("i-ph-caret-down");
    expect(chevron.getAttribute("aria-label")).toBe(
      "page.settings.notifications.category_collapse:System",
    );
    expect(subjectNames(container)).toEqual(["General", "Account"]);
    expect(
      container.querySelector("#notification-category-subjects-system"),
    ).not.toBeNull();

    chevron.click();
    await nextTick();
    expect(subjectNames(container)).toEqual([]);
  });

  it("unfolds a group from its title area too", async () => {
    const container = await mount();

    rowOf(container, "security")
      .querySelector<HTMLElement>("[data-category-title]")!
      .click();
    await nextTick();
    expect(subjectNames(container)).toEqual(["Security alerts"]);
  });

  it("keeps the master switch working on a folded group without unfolding it", async () => {
    const container = await mount();

    rowOf(container, "system")
      .querySelector<HTMLButtonElement>('[role="switch"]')!
      .click();
    await nextTick();

    await vi.waitFor(() =>
      expect(authFetch).toHaveBeenCalledWith(
        "/dms/pages/settings/user/notifications/preferences",
        {
          method: "PATCH",
          body: { "system:general": false, "system:account": false },
        },
      ),
    );
    expect(chevronOf(container, "system").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(subjectNames(container)).toEqual([]);
  });

  it("remembers the open groups in the browser", async () => {
    const first = await mount();
    chevronOf(first, "security").click();
    await nextTick();
    expect(
      localStorage.getItem(`${NOTIFICATION_GROUP_STORAGE_PREFIX}security`),
    ).toBe("open");
    app?.unmount();
    document.body.innerHTML = "";

    const second = await mount();
    // Read once mounted, as the server render cannot see it.
    await nextTick();
    expect(chevronOf(second, "security").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(chevronOf(second, "system").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(subjectNames(second)).toEqual(["Security alerts"]);
  });

  it("hydrates a kept open group folded, as the server drew it, then opens it", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    // The server cannot read the browser's storage: only the client has it.
    const container = await hydrate(() =>
      localStorage.setItem(
        `${NOTIFICATION_GROUP_STORAGE_PREFIX}system`,
        "open",
      ),
    );

    const messages = spies.flatMap((spy) =>
      spy.mock.calls.map((call) => String(call[0])),
    );
    expect(messages.filter((message) => message.includes("Hydration"))).toEqual(
      [],
    );
    await nextTick();
    expect(chevronOf(container, "system").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(subjectNames(container)).toEqual(["General", "Account"]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("folds every group when the browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const container = await mount();
    expect(subjectNames(container)).toEqual([]);

    chevronOf(container, "system").click();
    await nextTick();
    expect(subjectNames(container)).toEqual(["General", "Account"]);
    vi.restoreAllMocks();
  });
});
