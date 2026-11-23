/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  onMounted,
  ref,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationPreferencesForm from "../layers/dms-layout/app/entries/components/pages/settings/notification/NotificationPreferencesForm";
import { NOTIFICATION_GROUP_STORAGE_PREFIX } from "../layers/dms-layout/app/entries/composables/notification/useNotificationGroupsOpen";
import {
  browserRuntime,
  stubApiData,
  type ApiAnswer,
} from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const PREFERENCES_URL = "/dms/pages/settings/user/notifications/preferences";
const category = { id: "work", labelKey: "Work", icon: "i-ph-briefcase" };

function catalog(emailChannel: boolean, stored: Record<string, boolean> = {}) {
  return vi.fn(async (url: string): Promise<ApiAnswer> => {
    if (url.endsWith("/categories")) {
      return {
        categories: [category],
        emailChannel,
        subjects: [
          {
            id: "assigned",
            category,
            labelKey: "Assigned",
            email: emailChannel ? { defaultOn: false } : undefined,
          },
          {
            id: "digest",
            category,
            labelKey: "Digest",
            email: emailChannel ? { defaultOn: true } : undefined,
          },
          { id: "mentions", category, labelKey: "Mentions" },
        ],
      };
    }
    return url === PREFERENCES_URL ? stored : {};
  });
}

let app: App | undefined;

async function mount(authFetch: ReturnType<typeof catalog>) {
  stubApiData(authFetch);
  localStorage.setItem(`${NOTIFICATION_GROUP_STORAGE_PREFIX}work`, "open");
  app = createApp(
    defineComponent({ setup: () => () => h(NotificationPreferencesForm) }),
  );
  browserRuntime(app);
  const passThrough = defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        h("div", [slots.default?.(), slots.footer?.()]),
  });
  for (const [name, stub] of Object.entries({
    DmsSectionPanel: passThrough,
    DmsEmptyState: passThrough,
    DmsIconWell: defineComponent({ render: () => h("span") }),
    UBadge: defineComponent({
      props: { label: String },
      setup: (props) => () => h("span", { "data-badge": "" }, props.label),
    }),
    UIcon: defineComponent({ render: () => h("span") }),
    UButton: defineComponent({ render: () => h("button") }),
    USwitch: defineComponent({
      props: { modelValue: Boolean, disabled: Boolean },
      emits: ["update:modelValue"],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h("button", {
            ...attrs,
            type: "button",
            role: "switch",
            disabled: props.disabled,
            "aria-checked": String(props.modelValue),
            onClick: () => emit("update:modelValue", !props.modelValue),
          }),
    }),
    UCollapsible: defineComponent({
      props: { open: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          h("div", props.open ? slots.content?.() : []),
    }),
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  await vi.waitFor(() => expect(rowOf(container, "Assigned")).toBeTruthy());
  return container;
}

const rowOf = (container: HTMLElement, label: string) =>
  [
    ...container.querySelectorAll<HTMLElement>(
      '[role="rowgroup"] [role="row"]',
    ),
  ].find((row) =>
    row.querySelector('[role="rowheader"]')?.textContent?.includes(label),
  );

const emailSwitchOf = (container: HTMLElement, label: string) =>
  rowOf(container, label)?.querySelector<HTMLButtonElement>(
    '[data-channel="email"]',
  ) ?? null;

beforeEach(() => {
  installAuthSettingsRuntime();
  localStorage.clear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("notification preferences e-mail column", () => {
  it("keeps the Soon column without a registered channel (fails when an installation without a mail module draws e-mail switches)", async () => {
    const container = await mount(catalog(false));

    expect(emailSwitchOf(container, "Assigned")).toBeNull();
    expect(container.querySelector("[data-badge]")?.textContent).toBe(
      "page.settings.notifications.soon",
    );
    expect(container.textContent).toContain(
      "page.settings.notifications.email_hint",
    );
  });

  it("draws a switch for each subject offering e-mail, on its default (fails when the default of the offer is ignored)", async () => {
    const container = await mount(catalog(true));

    expect(
      emailSwitchOf(container, "Assigned")?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      emailSwitchOf(container, "Digest")?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(emailSwitchOf(container, "Mentions")).toBeNull();
    expect(container.querySelector("[data-badge]")).toBeNull();
    expect(container.textContent).toContain(
      "page.settings.notifications.email_hint_active",
    );
  });

  it("saves the e-mail switch under its own key (fails when it changes the in-app preference)", async () => {
    const authFetch = catalog(true);
    const container = await mount(authFetch);

    emailSwitchOf(container, "Assigned")?.click();

    await vi.waitFor(() =>
      expect(authFetch).toHaveBeenCalledWith(PREFERENCES_URL, {
        method: "PATCH",
        body: { "work:assigned@email": true },
      }),
    );
  });

  it("disables the e-mail switch of a subject off in the app (fails when e-mail looks on for a notification never sent)", async () => {
    const container = await mount(catalog(true, { "work:digest": false }));

    expect(emailSwitchOf(container, "Digest")?.disabled).toBe(true);
    expect(
      emailSwitchOf(container, "Digest")?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(emailSwitchOf(container, "Assigned")?.disabled).toBe(false);
  });
});
