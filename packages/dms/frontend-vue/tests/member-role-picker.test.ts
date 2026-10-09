// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  provide,
  ref,
} from "vue";
import {
  formFieldInjectionKey,
  formStateInjectionKey,
} from "@nuxt/ui/composables/useFormField";
import { sameFormValue } from "../layers/dms-ui/app/build/composables/unsaved-changes/formValue";

const ROLES_URL = "/settings/workspace/members/role-options";
const ROLE_OPTIONS = {
  roles: [
    { _id: "admin", name: "Admin", permissionIds: ["a", "b", "c"] },
    { _id: "finance", name: "Finance", permissionIds: ["c", "d"] },
    { _id: "support", name: "Support", permissionIds: ["e"] },
  ],
  totalPermissions: 10,
};

const fieldError = ref<string | undefined>();
const formState = ref<Record<string, unknown>>({});
const model = ref<string[] | null | undefined>([]);
const authFetch = vi.fn();

let app: App | undefined;
let host: HTMLDivElement;

const translate = (key: string, named?: Record<string, unknown>) =>
  named ? `${key} ${Object.values(named).join("/")}` : key;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 6; tick++) await nextTick();
}

/** The picker inside a UFormField named `roleIds`, as a form renders it. */
async function mountPicker(props: Record<string, unknown> = {}) {
  const { default: MemberRolePicker } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/members/MemberRolePicker.vue"
  );
  const Field = defineComponent({
    setup() {
      provide(
        formFieldInjectionKey,
        computed(() => ({
          name: "roleIds",
          error: fieldError.value,
          ariaId: "field-roles",
        })) as never,
      );
      provide(
        formStateInjectionKey,
        computed(() => formState.value),
      );
      return () =>
        h(MemberRolePicker, {
          id: "roleIds",
          rolesUrl: ROLES_URL,
          modelValue: model.value,
          "onUpdate:modelValue": (value: string[]) => {
            model.value = value;
          },
          ...props,
        });
    },
  });
  app = createApp(Field);
  const stub = (tag: string) =>
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h(tag, slots.default?.()),
    });
  app.component("UIcon", stub("i"));
  app.component("USkeleton", stub("span"));
  app.component("ULink", stub("a"));
  app.mount(host);
  await flush();
}

const pill = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button[data-value]")].find(
    (button) => button.textContent?.trim() === name,
  )!;
const pressed = () =>
  [...host.querySelectorAll("button[aria-pressed='true']")].map((button) =>
    button.textContent?.trim(),
  );
const hint = () => host.querySelector("p")?.textContent?.trim();

async function toggle(name: string): Promise<void> {
  pill(name).click();
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({ t: translate }));
  authFetch.mockReset();
  authFetch.mockResolvedValue(ROLE_OPTIONS);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  fieldError.value = undefined;
  formState.value = {};
  model.value = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("offers the server's roles and picks and unpicks them", async () => {
  await mountPicker();

  expect(authFetch).toHaveBeenCalledWith(ROLES_URL);
  expect(
    [...host.querySelectorAll("button[data-value]")].map((b) =>
      b.textContent?.trim(),
    ),
  ).toEqual(["Admin", "Finance", "Support"]);
  expect(pressed()).toEqual([]);

  await toggle("Finance");
  await toggle("Admin");
  expect(model.value).toEqual(["finance", "admin"]);
  expect(pressed()).toEqual(["Admin", "Finance"]);
  // Permissions granted by both roles count once.
  expect(hint()).toContain(
    "page.settings.members.invite.roles_hint Admin + Finance/4/10",
  );

  await toggle("Finance");
  expect(model.value).toEqual(["admin"]);
});

it("can clear every role, saying what an empty choice means", async () => {
  model.value = ["support"];
  await mountPicker({ allowEmpty: true });

  await toggle("Support");
  expect(model.value).toEqual([]);
  expect(hint()).toContain("page.settings.members.form.roles_hint_none");
});

it("asks for a role while none is picked when one is required", async () => {
  await mountPicker();
  expect(hint()).toContain("page.settings.members.invite.roles_hint_empty");
});

it("rings the unpicked pills and marks the group invalid on a field error", async () => {
  model.value = ["admin"];
  await mountPicker();
  const group = host.querySelector("[role=group]")!;
  expect(group.getAttribute("aria-invalid")).toBe("false");
  expect(pill("Finance").className).not.toContain("border-error");

  fieldError.value = "This field is required";
  await flush();

  expect(group.getAttribute("aria-invalid")).toBe("true");
  expect(group.getAttribute("aria-describedby")).toBe("field-roles-error");
  expect(pill("Finance").className).toContain("border-error");
  expect(pill("Support").className).toContain("border-error");
  // A picked role keeps its picked look.
  expect(pill("Admin").className).not.toContain("border-error");
});

it("puts a role picked again back in its loaded place, leaving the form clean", async () => {
  // As the members data API loads them: `{ _id, name }` each.
  const loaded = [
    { _id: "support", name: "Support" },
    { _id: "admin", name: "Admin" },
  ];
  model.value = ["support", "admin"];
  await mountPicker({
    initialValue: loaded,
    keyMapping: { label: "name", value: "_id" },
  });

  await toggle("Support");
  expect(sameFormValue(model.value, ["support", "admin"])).toBe(false);

  await toggle("Support");
  expect(model.value).toEqual(["support", "admin"]);
  expect(sameFormValue(model.value, ["support", "admin"])).toBe(true);

  // A role new to the form follows the loaded ones.
  await toggle("Finance");
  expect(model.value).toEqual(["support", "admin", "finance"]);
});

it("keeps the roles inert while the owner field is on", async () => {
  model.value = ["admin"];
  formState.value = { isTenantOwner: true };
  await mountPicker({ ownerField: "isTenantOwner" });

  expect(pill("Finance").disabled).toBe(true);
  expect(hint()).toContain("page.settings.members.invite.roles_owner_hint");
  await toggle("Finance");
  expect(model.value).toEqual(["admin"]);

  formState.value = { isTenantOwner: false };
  await flush();
  expect(pill("Finance").disabled).toBe(false);
  await toggle("Finance");
  expect(model.value).toEqual(["admin", "finance"]);
});

it("waits for the form's values before showing the pills", async () => {
  await mountPicker({ loading: true });
  expect(host.querySelectorAll("button[data-value]")).toHaveLength(0);
});

it("warns while a picked role amounts to owner-level access, not for an owner", async () => {
  authFetch.mockResolvedValue({
    ...ROLE_OPTIONS,
    roles: ROLE_OPTIONS.roles.map((role) =>
      role._id === "admin"
        ? { ...role, warnings: ["$page.settings.roles.warning.members"] }
        : role,
    ),
  });
  const warning = () =>
    host.querySelector("[data-role-owner-level]")?.textContent?.trim();
  await mountPicker({ ownerField: "isTenantOwner" });

  await toggle("Finance");
  expect(warning()).toBeUndefined();

  await toggle("Admin");
  expect(warning()).toBe(
    "page.settings.members.invite.roles_owner_level Admin",
  );

  formState.value = { isTenantOwner: true };
  await flush();
  expect(warning()).toBeUndefined();
});
