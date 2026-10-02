// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  watch,
} from "vue";
import {
  formErrorsInjectionKey,
  formFieldInjectionKey,
} from "@nuxt/ui/composables/useFormField";

const fieldError = ref<string | undefined>();
const formErrors = ref<Array<Record<string, unknown>>>([]);
const model = ref<string[]>([]);

let app: App | undefined;
let host: HTMLDivElement;

const translate = (key: string, named?: Record<string, unknown>) =>
  named ? `${key} ${Object.values(named).join("/")}` : key;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

/** The input inside a UFormField named `emails`, as the invite form has it. */
async function mountInput(): Promise<void> {
  const { default: InviteEmailsInput } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/members/InviteEmailsInput.vue"
  );
  const Field = defineComponent({
    setup() {
      provide(
        formFieldInjectionKey,
        computed(() => ({
          name: "emails",
          error: fieldError.value,
          ariaId: "field-emails",
        })) as never,
      );
      provide(formErrorsInjectionKey, formErrors as never);
      return () =>
        h(InviteEmailsInput, {
          id: "emails",
          modelValue: model.value,
          "onUpdate:modelValue": (value: string[]) => {
            model.value = value;
          },
        });
    },
  });
  app = createApp(Field);
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.config.globalProperties.$t = translate;
  app.mount(host);
  await flush();
}

const input = () => host.querySelector<HTMLInputElement>("#emails")!;
const entryError = () => host.querySelector("#emails-entry-error");

async function typeAndCommit(value: string): Promise<void> {
  input().value = value;
  input().dispatchEvent(new Event("input"));
  await flush();
  input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, named?: Record<string, unknown>) => translate(key, named),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
  }));
  fieldError.value = undefined;
  formErrors.value = [];
  model.value = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("shows a mistyped address under the field, describing the input", async () => {
  await mountInput();
  await typeAndCommit("not-an-address");

  expect(model.value).toEqual([]);
  expect(entryError()?.textContent).toBe(
    "page.settings.members.invite.email_invalid not-an-address",
  );
  expect(input().getAttribute("aria-invalid")).toBe("true");
  expect(input().getAttribute("aria-describedby")).toBe("emails-entry-error");

  // Typing again clears it.
  input().value = "not-an-address@";
  input().dispatchEvent(new Event("input"));
  await flush();
  expect(entryError()).toBeNull();
  expect(input().hasAttribute("aria-invalid")).toBe(false);
});

it("says when an address is already in the list", async () => {
  await mountInput();
  await typeAndCommit("ana@test.local");
  await typeAndCommit("ANA@test.local");

  expect(model.value).toEqual(["ana@test.local"]);
  expect(entryError()?.textContent).toBe(
    "page.settings.members.invite.email_duplicate ana@test.local",
  );
});

it("marks the addresses a server error names, the field invalid", async () => {
  model.value = ["ana@test.local", "bob@test.local"];
  await mountInput();
  fieldError.value = "Already a member of this workspace: bob@test.local";
  formErrors.value = [
    {
      name: "emails",
      message: fieldError.value,
      values: ["bob@test.local"],
    },
  ];
  await flush();

  const refused = [...host.querySelectorAll("[data-refused]")].map((tag) =>
    tag.textContent?.trim(),
  );
  expect(refused).toEqual(["bob@test.local"]);
  expect(input().getAttribute("aria-invalid")).toBe("true");
  expect(input().getAttribute("aria-describedby")).toBe("field-emails-error");
});
