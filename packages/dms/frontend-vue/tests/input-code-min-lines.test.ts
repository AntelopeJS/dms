// @vitest-environment jsdom
/**
 * A code editor's `minLines` sets its height through `--dms-code-min-height`
 * on `.cm-content`. CodeMirror's own `.cm-content { min-height: 100% }` is
 * unlayered and outranks a Tailwind utility, so the rule must be important
 * or the editor shrinks to its lines whatever `minLines` says.
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@nuxt/ui/composables/useFormField", () => ({
  useFormField: () => ({
    color: ref(undefined),
    ariaAttrs: ref(undefined),
    emitFormInput: vi.fn(),
    emitFormBlur: vi.fn(),
  }),
}));
vi.mock("@nuxt/ui/runtime/vue/components/Icon.vue", () => ({
  default: defineComponent({ render: () => h("i") }),
}));
vi.mock("../layers/dms-ui/app/composables/form/useControlError", () => ({
  useControlError: () => ({ report: vi.fn() }),
}));
vi.mock("../layers/dms-ui/app/build/utils/codeEditor", () => ({
  createCodeEditor: () => ({
    setValue: vi.fn(),
    setReadOnly: vi.fn(),
    setContentAttributes: vi.fn(),
    destroy: vi.fn(),
  }),
}));

const LINE_HEIGHT_PX = 19;
const EDITOR_PADDING_PX = 16;

let app: App | undefined;

async function mountCode(props: Record<string, unknown>): Promise<HTMLElement> {
  const { default: InputCode } = await import(
    "../layers/dms-ui/app/components/form/components/InputCode.vue"
  );
  const root = document.createElement("div");
  app = createApp({
    render: () =>
      h(InputCode, { language: "json", modelValue: "{}", ...props }),
  });
  app.component("UKbd", defineComponent({ render: () => h("kbd") }));
  app.mount(root);
  await nextTick();
  return root;
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
  vi.stubGlobal("useTemplateRef", useTemplateRef);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {} }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it("sizes the editor from minLines with a rule CodeMirror cannot outrank", async () => {
  const root = await mountCode({ minLines: 12, maxLines: 30 });
  const frame = root.firstElementChild as HTMLElement;
  expect(frame.style.getPropertyValue("--dms-code-min-height")).toBe(
    `${12 * LINE_HEIGHT_PX + EDITOR_PADDING_PX}px`,
  );
  const host = root.querySelector<HTMLElement>("[data-dms-code-host]")!;
  const classes = host.className.split(/\s+/);
  expect(classes).toContain("[&_.cm-content]:min-h-(--dms-code-min-height)!");
  expect(classes).toContain("[&_.cm-scroller]:max-h-(--dms-code-max-height)");
});

it("fills its flex parent's height when asked, minLines its floor and no maxLines", async () => {
  const root = await mountCode({ minLines: 12, maxLines: 30, fill: true });
  const frame = root.firstElementChild as HTMLElement;
  const frameClasses = frame.className.split(/\s+/);
  expect(frameClasses).toEqual(
    expect.arrayContaining(["flex", "flex-1", "flex-col", "overflow-clip"]),
  );
  // Clipping without scrolling keeps the floor as the frame's minimum.
  expect(frameClasses).not.toContain("overflow-hidden");
  // Once the editor takes over from the code shown as is.
  await vi.waitFor(() => expect(root.querySelector("pre")).toBeNull());
  const host = root.querySelector<HTMLElement>("[data-dms-code-host]")!;
  const classes = host.className.split(/\s+/);
  expect(classes).toEqual(
    expect.arrayContaining([
      "flex-1",
      "contain-size",
      "min-h-(--dms-code-min-height)",
      "[&_.cm-scroller]:flex-1",
      "[&_.cm-scroller]:min-h-0",
      "[&_.cm-content]:min-h-(--dms-code-min-height)!",
    ]),
  );
  expect(classes).not.toContain(
    "[&_.cm-scroller]:max-h-(--dms-code-max-height)",
  );
});
