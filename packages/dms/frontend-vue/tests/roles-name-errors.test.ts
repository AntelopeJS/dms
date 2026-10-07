// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  Suspense,
  watch,
} from "vue";

const ROLE = {
  _id: "role-1",
  name: "Editors",
  memberCount: 0,
  inviteCount: 0,
  members: [],
};

const api = {
  fetchOverview: vi.fn(),
  fetchTree: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  duplicateRole: vi.fn(),
  deleteRole: vi.fn(),
};
const addToast = vi.fn();
// The delete dialog as the server words it, confirmed with a role picked.
const authFetch = vi.fn(async () => ({
  title: "$page.settings.roles.editor.delete_title",
  params: { name: ROLE.name, count: 0 },
  fields: [],
}));
const confirm = vi.fn(
  async (options: {
    onConfirm?: (values: Record<string, unknown>) => Promise<unknown>;
  }) => {
    await options.onConfirm?.({ reassignTo: "role-2" });
    return true;
  },
);
const apiError = vi.fn();
const draft = ref({ id: ROLE._id, name: ROLE.name, description: "" });

const passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

// The leave guard needs the app (router, confirm dialog): the dirty state only.
vi.mock(
  "#dms-ui/app/composables/unsaved-changes/useUnsavedChanges",
  async () => {
    const { computed, toValue } = await import("vue");
    return {
      useUnsavedChanges: (options: { dirty: () => boolean }) => ({
        isDirty: computed(() => !!toValue(options.dirty)),
        confirmLeave: async () => true,
      }),
    };
  },
);

vi.mock("@nuxt/ui/components/Button.vue", () => ({ default: passthrough }));
vi.mock("@nuxt/ui/components/FormField.vue", () => ({ default: passthrough }));
vi.mock("@nuxt/ui/components/Select.vue", () => ({ default: passthrough }));
vi.mock("@nuxt/ui/runtime/vue/components/Icon.vue", () => ({
  default: passthrough,
}));
vi.mock(
  "../layers/dms-layout/app/build/components/pages/settings/roles/RolesList.vue",
  () => ({ default: passthrough }),
);
vi.mock(
  "../layers/dms-layout/app/build/components/pages/settings/roles/RoleOwnerPanel.vue",
  () => ({ default: passthrough }),
);
// The editor's head: the name input, its inline error and a save button.
vi.mock(
  "../layers/dms-layout/app/build/components/pages/settings/roles/RoleEditor.vue",
  async () => {
    const vue = await import("vue");
    return {
      default: vue.defineComponent({
        props: { name: String, nameError: String },
        emits: ["save", "delete", "update:name"],
        setup(props, { emit, expose }) {
          const input = vue.ref<HTMLInputElement | null>(null);
          expose({
            inputOf: (field: string) =>
              field === "name" ? input.value : undefined,
          });
          return () =>
            vue.h("div", [
              vue.h("input", {
                id: "role-name",
                ref: input,
                value: props.name,
                "aria-invalid": props.nameError ? "true" : undefined,
                onInput: (event: Event) =>
                  emit("update:name", (event.target as HTMLInputElement).value),
              }),
              props.nameError
                ? vue.h("p", { id: "role-name-error" }, props.nameError)
                : null,
              vue.h("button", {
                id: "role-save",
                type: "button",
                onClick: () => emit("save"),
              }),
              vue.h("button", {
                id: "role-delete",
                type: "button",
                onClick: () => emit("delete"),
              }),
            ]);
        },
      }),
    };
  },
);
vi.mock(
  "../layers/dms-layout/app/build/components/pages/settings/roles/useRoleEditor",
  () => ({
    useRoleEditor: () => ({
      selectedId: ref(ROLE._id),
      selectedRole: computed(() => ROLE),
      draft,
      selection: ref(new Set()),
      autoAdded: ref(new Map()),
      roles: computed(() => [ROLE]),
      index: ref({ allIds: [] }),
      areas: ref([]),
      isNew: computed(() => false),
      savedIds: ref(new Set()),
      isDirty: computed(() => true),
      changes: ref([]),
      payload: computed(() => ({ ...draft.value, permissions: [] })),
      canGrant: () => true,
      reset: vi.fn(),
      select: vi.fn(),
      selectDefault: vi.fn(),
      toggle: vi.fn(),
    }),
  }),
);
vi.mock(
  "../layers/dms-layout/app/build/components/pages/settings/roles/useRolesApi",
  () => ({ useRolesApi: () => api }),
);
vi.mock(
  "../layers/dms-layout/app/composables/layout/usePageHeaderActions",
  () => ({
    usePageHeaderActions: vi.fn(),
  }),
);
vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    isActive: ref(false),
    start: vi.fn(),
    update: vi.fn(),
  }),
}));

let app: App | undefined;
let host: HTMLDivElement;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 6; tick++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
}

async function mountRolesPage(): Promise<void> {
  const { default: RolesPage } = await import(
    "../layers/dms-layout/app/custom-pages/settings/roles.vue"
  );
  app = createApp({ render: () => h(Suspense, null, () => h(RolesPage)) });
  app.mount(host);
  await flush();
}

const nameInput = () => host.querySelector<HTMLInputElement>("#role-name")!;
const nameError = () => host.querySelector("#role-name-error");

async function save(): Promise<void> {
  host.querySelector<HTMLButtonElement>("#role-save")!.click();
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("h", h);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useConfirm", () => ({ confirm }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("interpolateUrl", (url: string, data: Record<string, string>) =>
    url.replace(/\{(\w+)\}/g, (_, key: string) => data[key] ?? ""),
  );
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => `t(${message})`,
  }));
  vi.stubGlobal("useApiError", apiError);
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useDmsRoute", () => ({ path: "/settings/workspace/roles" }));
  vi.stubGlobal("useDmsAsyncData", async () => ({
    data: ref({
      overview: {
        roles: [ROLE],
        owners: [],
        totalPermissions: 0,
        capabilities: { canAdd: true, canEdit: true, canDelete: true },
      },
      tree: [],
    }),
    refresh: vi.fn(async () => {}),
  }));
  draft.value = { id: ROLE._id, name: ROLE.name, description: "" };
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows a name already taken under the name, focused, without a toast", async () => {
  api.updateRole.mockRejectedValue({
    statusCode: 409,
    data: "$page.settings.roles.error.name_taken",
  });
  await mountRolesPage();
  await save();

  // Translated through `useI18n` (identity here).
  expect(nameError()?.textContent).toBe("page.settings.roles.error.name_taken");
  expect(nameInput().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(nameInput());
  expect(addToast).not.toHaveBeenCalled();
  expect(apiError).not.toHaveBeenCalled();

  // Editing the name clears it.
  draft.value = { ...draft.value, name: "Editors 2" };
  await flush();
  expect(nameError()).toBeNull();
});

it("refuses an empty name inline before calling the API", async () => {
  draft.value = { ...draft.value, name: "  " };
  await mountRolesPage();
  await save();

  expect(api.updateRole).not.toHaveBeenCalled();
  expect(nameError()?.textContent).toBe("t($dms.field_errors.required)");
  expect(addToast).not.toHaveBeenCalled();
});

it("keeps a failure tied to no field as a toast", async () => {
  const failure = { statusCode: 403, data: "error.forbidden" };
  api.updateRole.mockRejectedValue(failure);
  await mountRolesPage();
  await save();

  expect(nameError()).toBeNull();
  expect(apiError).toHaveBeenCalledExactlyOnceWith(failure);
});

it("asks the delete dialog the server words, then deletes with the picked role", async () => {
  await mountRolesPage();
  host.querySelector<HTMLButtonElement>("#role-delete")!.click();
  await flush();

  expect(authFetch).toHaveBeenCalledWith(
    "/settings/workspace/roles/role-1/delete-confirm",
  );
  expect(api.deleteRole).toHaveBeenCalledWith("role-1", {
    reassignTo: "role-2",
  });
  expect(addToast).toHaveBeenCalledWith({
    title: "page.settings.roles.editor.deleted",
    color: "success",
  });
});
