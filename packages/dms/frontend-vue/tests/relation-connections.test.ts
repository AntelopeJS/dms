/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createApp,
  h,
  nextTick,
  provide,
  ref,
  shallowRef,
  Suspense,
  type App,
  type Component,
} from "vue";
import SelectMenu from "@nuxt/ui/components/SelectMenu.vue";
import Button from "@nuxt/ui/components/Button.vue";
import type { DrawerOptions } from "../layers/dms-ui/app/composables/containers/types";
import { host, registerFormComponents, t } from "./helpers/form-runtime";
import { browserRuntime, engine } from "./helpers/api-data-runtime";
import {
  FORM_ENTRY_CONTEXT_KEY,
  type FormEntryContext,
} from "../layers/dms-ui/app/entries/composables/form/formEntryContext";
import { FORM_LAYOUT_CLASSES } from "../layers/dms-ui/app/entries/composables/form/formLayout";
import type { FormData } from "../layers/dms-ui/app/composables/form/types/value";
import type { TableFilter } from "../layers/dms-ui/app/entries/components/table/TableRoot";
import { defined } from "./helpers/defined";

type SearchParams = Record<string, string | string[] | undefined>;

let app: App | undefined;
let Relation: Component;
beforeEach(async () => {
  Relation = (
    await import(
      "../layers/dms-ui/app/components/form/components/InputRelation.vue"
    )
  ).default;
}, 60_000);
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

interface MountOptions {
  relationProps?: { filter: TableFilter };
  hasPermission?: (id: string) => boolean;
  /** The form the picker fills; none for a table filter's picker. */
  formContext?: FormEntryContext;
}

function formContextOf(state: FormData): FormEntryContext {
  return {
    state: ref<FormData>(state),
    initialValues: ref<FormData>(state),
    loading: ref(false),
    componentId: "ticket",
    pageId: "tickets",
    layoutClasses: () => FORM_LAYOUT_CLASSES.vertical,
    isFieldHidden: () => false,
    isFieldRequired: () => false,
    isReadOnly: ref(false),
    showsChanges: false,
    isFieldChanged: () => false,
    isFieldDisabled: () => false,
    baselineValue: () => undefined,
    fieldSaveState: () => "idle",
    retrySave: () => {},
  };
}

async function mountRelation(options: MountOptions = {}) {
  await engine.setupFrontendModules([]);
  vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
  vi.stubGlobal("usePermissions", () => ({
    hasPermission: options.hasPermission ?? (() => true),
    loadPermissions: async () => {},
  }));
  vi.stubGlobal("useFileReadUrls", () => ({
    getUrl: () => undefined,
    resolve: vi.fn(),
  }));
  vi.stubGlobal("useLeaveGuard", () => ({ clearGuards: vi.fn() }));
  const authFetch = vi.fn(
    async (_url: string, _request?: { params?: SearchParams }) => ({
      results: [],
      total: 0,
    }),
  );
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
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
  const selected = ref<string | undefined>("ann");
  const updates = vi.fn((value: string | undefined) => {
    selected.value = value;
  });
  app = createApp({
    setup() {
      if (options.formContext) {
        provide(FORM_ENTRY_CONTEXT_KEY, options.formContext);
      }
    },
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
              ...options.relationProps,
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
  return { selected, updates, open, authFetch };
}

async function openMenu() {
  const trigger = defined(
    host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]'),
  );
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
  const add = defined(
    [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes(t("dms.form.relation.add_new")),
    ),
  );
  add.click();
  await vi.waitFor(() =>
    expect(host.querySelector('[role="dialog"] input')).not.toBeNull(),
  );
  expect(open).toHaveBeenCalledOnce();
  expect(selected.value).toBe("ann");
  expect(updates).not.toHaveBeenCalled();
  const input = defined(
    host.querySelector<HTMLInputElement>('[role="dialog"] input'),
  );
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
  const option = defined(host.querySelector<HTMLElement>('[role="option"]'));
  option.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await vi.waitFor(() => expect(selected.value).toBeUndefined());
  expect(updates).toHaveBeenCalledExactlyOnceWith(undefined);
});

const ACTIVE = { accessorKey: "isArchived", mode: "ne", value: "true" };

async function searchParamsOnOpen(options: MountOptions) {
  const { authFetch } = await mountRelation({
    ...options,
    relationProps: { filter: ACTIVE },
  });
  await openMenu();
  await vi.waitFor(() => expect(authFetch).toHaveBeenCalled());
  return authFetch.mock.calls[0]?.[1]?.params;
}

it("searches a form's picker with its fixed filter", async () => {
  const params = await searchParamsOnOpen({ formContext: formContextOf({}) });
  expect(params).toMatchObject({ filter_isArchived: "ne:true" });
});

it("leaves the fixed filter out of a table filter's picker", async () => {
  const params = await searchParamsOnOpen({});
  expect(params).not.toHaveProperty("filter_isArchived");
});

it("offers a member no relation add whose table declares no add permission", async () => {
  await mountRelation({ hasPermission: (id) => id !== "*" });
  await openMenu();
  expect(host.textContent).not.toContain(t("dms.form.relation.add_new"));
});
