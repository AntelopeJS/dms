import {
  createApp,
  h,
  nextTick,
  type App,
  type Component,
  type FunctionalComponent,
} from "vue";
import { createI18n } from "vue-i18n";
import { vi } from "vitest";
import en from "../../layers/dms-layout/app/entries/i18n/locales/layout-en-GB.json";

/** What the fake `/api/branding` routes received. */
export interface BrandingCall {
  url: string;
  method: string;
  body: unknown;
}

type Answer = (call: BrandingCall) => unknown;

/**
 * Stubs the editor's auto-imports: a real i18n composer, the confirm dialog,
 * the DMS defaults, and `$authFetch` answered by `answer`.
 */
export function installBrandingRuntime(answer: Answer): {
  calls: BrandingCall[];
  confirm: ReturnType<typeof vi.fn>;
} {
  const calls: BrandingCall[] = [];
  const confirm = vi.fn(async () => true);
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en },
  });
  vi.stubGlobal("useI18n", () => i18n.global);
  vi.stubGlobal("useConfirm", () => ({ confirm }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    branding: {
      defaults: {
        colors: { primary: "dms", neutral: "neutral" },
        logo: { default: { light: "/dms-light.svg", dark: "/dms-dark.svg" } },
      },
    },
  }));
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: async (
      url: string,
      options: { method?: string; body?: unknown } = {},
    ) => {
      const call = { url, method: options.method ?? "GET", body: options.body };
      calls.push(call);
      return structuredClone(answer(call));
    },
  }));
  return { calls, confirm };
}

const passthrough =
  (tag: string): FunctionalComponent =>
  (_, { attrs, slots }) =>
    h(tag, attrs, slots.default?.());

const ButtonStub: FunctionalComponent = (_, { attrs, slots }) => {
  const { loading, disabled, ...rest } = attrs;
  return h(
    "button",
    { ...rest, disabled: Boolean(disabled) || Boolean(loading) },
    slots.default?.(),
  );
};

const TitledStub: FunctionalComponent = (_, { attrs, slots }) => {
  const { title, description, label, ...rest } = attrs;
  return h("div", rest, [
    String(title ?? label ?? ""),
    String(description ?? ""),
    slots.actions?.(),
  ]);
};

const STUBS: Record<string, Component> = {
  UButton: ButtonStub,
  UBadge: passthrough("span"),
  USkeleton: passthrough("div"),
  UIcon: passthrough("i"),
  UInput: passthrough("input"),
  USelect: passthrough("div"),
  UPopover: passthrough("div"),
  DmsEyebrow: TitledStub,
  DmsBanner: TitledStub,
  DmsEmptyState: TitledStub,
};

/** Waits for the editor's reads and renders to settle. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}

export async function mountEditor(
  editor: Component,
): Promise<{ app: App; host: HTMLElement }> {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp(editor);
  Object.entries(STUBS).forEach(([name, stub]) => app.component(name, stub));
  app.mount(host);
  await settle();
  return { app, host };
}

export function buttonNamed(
  host: HTMLElement,
  text: string,
): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.trim() === text ||
      button.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`No button named ${text}`);
  return found;
}

export function changeCountText(host: HTMLElement): string | undefined {
  return host.querySelector("[data-change-count]")?.textContent?.trim();
}

export async function pickFile(input: Element, file: File): Promise<void> {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  await settle();
}
