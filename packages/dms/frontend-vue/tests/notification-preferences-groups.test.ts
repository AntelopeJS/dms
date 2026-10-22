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

const preferences = vi.hoisted(() => ({
  toggleCategory: vi.fn(),
  toggleSubject: vi.fn(),
}));

vi.mock(
  "../layers/dms-layout/app/build/composables/notification/useNotificationPreferences",
  async () => {
    const vue = await import("vue");
    const system = { id: "system", labelKey: "System", icon: "i-ph-gear" };
    const security = {
      id: "security",
      labelKey: "Security",
      icon: "i-ph-shield",
    };
    const subjects = {
      system: [
        { id: "general", category: system, labelKey: "General" },
        { id: "account", category: system, labelKey: "Account" },
      ],
      security: [
        { id: "alerts", category: security, labelKey: "Security alerts" },
      ],
    } as Record<string, { id: string; labelKey: string }[]>;
    return {
      useNotificationPreferences: () => ({
        ...preferences,
        categories: vue.ref([system, security]),
        subjectsOf: (id: string) => subjects[id] ?? [],
        failedChanges: vue.ref(undefined),
        saveState: vue.ref("idle"),
        isLoading: vue.ref(false),
        loadFailed: vue.ref(false),
        isEnabled: () => true,
        rowState: () => "idle",
        toggleableSubjectsOf: (category: { id: string }) =>
          subjects[category.id] ?? [],
        retry: vi.fn(),
        load: vi.fn(),
      }),
    };
  },
);

vi.mock(
  "../layers/dms-layout/app/composables/layout/useInstantSaveHeader",
  () => ({
    useInstantSaveHeader: vi.fn(),
  }),
);

vi.mock("#dms-ui/app/build/components/skeleton/RowSkeleton.vue", async () => {
  const vue = await import("vue");
  return { default: vue.defineComponent({ render: () => vue.h("span") }) };
});

let app: App | undefined;

function createFormApp(create: typeof createApp): App {
  const formApp = create(
    defineComponent({
      setup: () => () => h(NotificationPreferencesForm as Component),
    }),
  );
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

function mount() {
  app = createFormApp(createApp);
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  return container;
}

/**
 * Renders the form on the "server", runs what only the browser holds, then
 * hydrates the server markup.
 */
async function hydrate(runOnClient: () => void) {
  const container = document.createElement("div");
  container.innerHTML = await renderToString(createFormApp(createSSRApp));
  document.body.append(container);
  runOnClient();
  app = createFormApp(createSSRApp);
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
  vi.clearAllMocks();
});

describe("notification preferences groups", () => {
  it("starts every group folded, with its count on the group row", () => {
    const container = mount();

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
    const container = mount();
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
    const container = mount();

    rowOf(container, "security")
      .querySelector<HTMLElement>("[data-category-title]")!
      .click();
    await nextTick();
    expect(subjectNames(container)).toEqual(["Security alerts"]);
  });

  it("keeps the master switch working on a folded group without unfolding it", async () => {
    const container = mount();

    rowOf(container, "system")
      .querySelector<HTMLButtonElement>('[role="switch"]')!
      .click();
    await nextTick();

    expect(preferences.toggleCategory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "system" }),
      false,
    );
    expect(chevronOf(container, "system").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(subjectNames(container)).toEqual([]);
  });

  it("remembers the open groups in the browser", async () => {
    const first = mount();
    chevronOf(first, "security").click();
    await nextTick();
    expect(
      localStorage.getItem(`${NOTIFICATION_GROUP_STORAGE_PREFIX}security`),
    ).toBe("open");
    app?.unmount();
    document.body.innerHTML = "";

    const second = mount();
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
    const container = mount();
    expect(subjectNames(container)).toEqual([]);

    chevronOf(container, "system").click();
    await nextTick();
    expect(subjectNames(container)).toEqual(["General", "Account"]);
    vi.restoreAllMocks();
  });
});
