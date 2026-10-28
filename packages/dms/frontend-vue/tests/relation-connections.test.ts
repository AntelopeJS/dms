/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createApp,
  h,
  nextTick,
  ref,
  shallowRef,
  Suspense,
  type App,
} from "vue";
import SelectMenu from "@nuxt/ui/components/SelectMenu.vue";
import Button from "@nuxt/ui/components/Button.vue";
import type { DrawerOptions } from "../layers/dms-ui/app/composables/containers/types";
import { host, registerFormComponents, t } from "./helpers/form-runtime";
import { browserRuntime, engine } from "./helpers/api-data-runtime";

let app: App | undefined;
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  app?.unmount();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

async function mountRelation() {
  await engine.setupFrontendModules([]);
  vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
  vi.stubGlobal("usePermissions", () => ({
    hasPermission: () => true,
    loadPermissions: async () => {},
  }));
  vi.stubGlobal("useFileReadUrls", () => ({
    getUrl: () => undefined,
    resolve: vi.fn(),
  }));
  vi.stubGlobal("useLeaveGuard", () => ({ clearGuards: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: vi.fn(async () => ({ results: [], total: 0 })),
  }));
  const drawer = shallowRef<DrawerOptions>();
  const open = vi.fn((options: DrawerOptions) => {
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(host.textContent).not.toContain(t("dms.form.relation.add_new"));
    expect(document.activeElement).toBe(
      host.querySelector('[aria-haspopup="listbox"]'),
    );
    drawer.value = options;
    return {
      close: () => {
        drawer.value = undefined;
      },
    };
  });
  vi.stubGlobal("useDrawer", () => ({ open }));
  const { default: Relation } = await import(
    "../layers/dms-ui/app/components/form/components/Relation.vue"
  );
  const selected = ref<string | undefined>("ann");
  const updates = vi.fn((value: string | undefined) => {
    selected.value = value;
  });
  app = createApp({
    render: () =>
      h("div", [
        h(Suspense, null, {
          default: () =>
            h(Relation, {
              searchUrl: "/api/people",
              modelValue: selected.value,
              initialValue: [
                { label: "Ann", value: "ann" },
                { label: "Bob", value: "bob" },
              ],
              "onUpdate:modelValue": updates,
              addForm: {
                componentName: "Form",
                options: {
                  componentId: "new",
                  pageId: "page",
                  submitUrl: "/api/people/new",
                  saveMode: "footer",
                  fields: [
                    {
                      id: "name",
                      label: "Name",
                      component: { componentName: "Text" },
                    },
                  ],
                },
              },
            }),
        }),
        drawer.value
          ? h("section", { role: "dialog" }, [
              h(Suspense, null, {
                default: () =>
                  drawer.value
                    ? h(drawer.value.component, drawer.value.componentOptions)
                    : null,
              }),
            ])
          : null,
      ]),
  });
  registerFormComponents(app);
  app.component("USelectMenu", SelectMenu);
  app.component("UButton", Button);
  browserRuntime(app);
  app.mount(host);
  await vi.waitFor(() =>
    expect(host.querySelector('[aria-haspopup="listbox"]')).not.toBeNull(),
  );
  return { selected, updates, open };
}

async function openMenu() {
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-haspopup="listbox"]',
  )!;
  trigger.click();
  await vi.waitFor(() =>
    expect(host.querySelector('[role="listbox"]')).not.toBeNull(),
  );
}

it("rejects a relation add action selected as a value or opened before its menu releases focus", async () => {
  const { selected, updates, open } = await mountRelation();
  await openMenu();
  const options = [...host.querySelectorAll('[role="option"]')];
  expect(options.map((option) => option.textContent)).toEqual(["Ann", "Bob"]);
  const add = [...host.querySelectorAll("button")].find((entry) =>
    entry.textContent?.includes(t("dms.form.relation.add_new")),
  )!;
  add.click();
  await vi.waitFor(() =>
    expect(host.querySelector('[role="dialog"] input')).not.toBeNull(),
  );
  expect(open).toHaveBeenCalledOnce();
  expect(selected.value).toBe("ann");
  expect(updates).not.toHaveBeenCalled();
  const input = host.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  input.focus();
  input.value = "Carol";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("Carol");
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
    t("dms.form.field_notes.changed"),
  );
});

it("rejects forwarding a repeated relation pick before its deselection", async () => {
  const { selected, updates } = await mountRelation();
  await openMenu();
  const option = host.querySelector<HTMLElement>('[role="option"]')!;
  option.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await vi.waitFor(() => expect(selected.value).toBeUndefined());
  expect(updates).toHaveBeenCalledExactlyOnceWith(undefined);
});
