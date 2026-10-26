// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  Suspense,
  type App,
} from "vue";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { useTranslation } from "../layers/dms-core/app/composables/translation/useTranslation";
import { useApiError } from "../layers/dms-core/app/composables/useApiError";
import { useConfirm } from "../layers/dms-ui/app/composables/confirm/useConfirm";
import SaveBar from "../layers/dms-ui/app/components/save-bar/SaveBar.vue";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const BASE = "/dms/pages/settings/workspace/roles";
const ROLE = {
  _id: "role-1",
  name: "Editors",
  memberCount: 0,
  inviteCount: 0,
  members: [],
  permissions: [],
};
const addToast = vi.fn();
const write = vi.fn();
const authFetch = vi.fn(async (url: string, options?: { method?: string }) => {
  if (url.endsWith("/overview"))
    return {
      roles: [ROLE],
      owners: { memberCount: 0, members: [] },
      totalPermissions: 0,
      capabilities: { canAdd: true, canEdit: true, canDelete: true },
    };
  if (url.endsWith("/editor-tree")) return [];
  if (url.endsWith("/delete-confirm"))
    return {
      title: "$page.settings.roles.editor.delete_title",
      params: { name: ROLE.name, count: 0 },
      fields: [],
    };
  return write(url, options);
});
let app: App | undefined;
let host: HTMLDivElement;

const Input = defineComponent({
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup: (props, { emit, expose }) => {
    const inputRef = ref<HTMLInputElement>();
    expose({ inputRef });
    return () =>
      h("input", {
        ref: inputRef,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      });
  },
});

async function flush() {
  for (let tick = 0; tick < 8; tick++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
}

async function mountRolesPage() {
  const { default: RolesPage } = await import(
    "../layers/dms-layout/app/custom-pages/settings/roles.vue"
  );
  app = createApp({ render: () => h(Suspense, null, () => h(RolesPage)) });
  browserRuntime(app);
  app.component("DmsSaveBar", SaveBar);
  app.component("UInput", Input);
  app.component(
    "UButton",
    defineComponent({
      props: { label: String, disabled: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          h("button", { disabled: props.disabled }, [
            props.label,
            slots.default?.(),
          ]),
    }),
  );
  app.component(
    "UFormField",
    defineComponent({
      props: { label: String, error: String },
      setup:
        (props, { slots }) =>
        () =>
          h("div", { "data-field": props.label }, [
            slots.default?.(),
            props.error ? h("p", props.error) : null,
          ]),
    }),
  );
  app.component(
    "UDropdownMenu",
    defineComponent({
      props: { items: Array },
      setup: (props) => () =>
        h(
          "div",
          (props.items as { label: string; onSelect: () => void }[]).map(
            (item) => h("button", { onClick: item.onSelect }, item.label),
          ),
        ),
    }),
  );
  for (const name of [
    "UIcon",
    "UAvatar",
    "UBadge",
    "UTooltip",
    "DmsMeter",
    "DmsIconWell",
    "DmsBanner",
  ])
    app.component(name, () => null);
  app.mount(host);
  await vi.waitFor(() => expect(nameInput()).toBeTruthy());
}

const nameInput = () =>
  host.querySelector<HTMLInputElement>(
    'input[placeholder="page.settings.roles.editor.placeholder_name"]',
  )!;
const nameError = () =>
  host.querySelector('[data-field="page.settings.roles.editor.field_name"] p');
async function typeName(value: string) {
  nameInput().value = value;
  nameInput().dispatchEvent(new Event("input"));
  await flush();
}
const button = (label: string) =>
  [...host.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  )!;
async function save() {
  button("dms.save_bar.save").click();
  await flush();
}

beforeEach(() => {
  installAuthSettingsRuntime();
  stubApiData(authFetch);
  vi.stubGlobal("h", h);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useTranslation", useTranslation);
  vi.stubGlobal("useApiError", useApiError);
  vi.stubGlobal("useConfirm", useConfirm);
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useDmsRoute", () => ({
    path: "/settings/workspace/roles",
    query: {},
  }));
  vi.stubGlobal("useOverlay", () => ({
    create: (
      _component: unknown,
      options: {
        props: {
          onConfirm?: (values: Record<string, unknown>) => Promise<unknown>;
        };
      },
    ) => ({
      open: async () => {
        await options.props.onConfirm?.({ reassignTo: "role-2" });
        return true;
      },
    }),
  }));
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
  write.mockRejectedValue({
    statusCode: 409,
    data: "$page.settings.roles.error.name_taken",
  });
  await mountRolesPage();
  await typeName("Editors 2");
  await save();
  expect(nameError()?.textContent).toBe("page.settings.roles.error.name_taken");
  expect(document.activeElement).toBe(nameInput());
  expect(addToast).not.toHaveBeenCalled();
  await typeName("Editors 3");
  expect(nameError()).toBeNull();
});

it("refuses an empty name inline before calling the API", async () => {
  await mountRolesPage();
  await typeName("  ");
  await save();
  expect(write).not.toHaveBeenCalled();
  expect(nameError()?.textContent).toBe("dms.field_errors.required");
  expect(addToast).not.toHaveBeenCalled();
});

it("keeps a failure tied to no field as a toast", async () => {
  write.mockRejectedValue({ statusCode: 403, data: "error.forbidden" });
  await mountRolesPage();
  await typeName("Editors 2");
  await save();
  expect(nameError()).toBeNull();
  expect(addToast).toHaveBeenCalledWith(
    expect.objectContaining({ color: "error" }),
  );
});

it("asks the delete dialog the server words, then deletes with the picked role", async () => {
  write.mockResolvedValue(1);
  await mountRolesPage();
  button("page.settings.roles.editor.delete").click();
  await flush();
  expect(authFetch).toHaveBeenCalledWith(`${BASE}/role-1/delete-confirm`);
  expect(write).toHaveBeenCalledWith(expect.stringContaining("/delete"), {
    method: "DELETE",
    query: { id: "role-1" },
    body: { reassignTo: "role-2" },
  });
  expect(addToast).toHaveBeenCalledWith({
    title: "page.settings.roles.editor.deleted",
    color: "success",
  });
});
