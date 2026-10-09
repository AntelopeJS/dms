// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Component,
  type Ref,
} from "vue";
import GithubStarPrompt from "../layers/dms-layout/app/build/components/layout/GithubStarPrompt.vue";
import EmptyLayout from "../layers/dms-layout/app/custom-layouts/EmptyLayout.vue";
import {
  GITHUB_STAR_PROMPT_DELAY_MS,
  GITHUB_STAR_PROMPT_KEYS,
  GITHUB_STAR_PROMPT_SNOOZE_MS,
  GITHUB_STAR_PROMPT_TICK_MS,
} from "../layers/dms-layout/app/build/composables/general/useGithubStarPrompt";
import { GITHUB_REPOSITORY_URL } from "../layers/dms-layout/app/build/utils/github-repository";

vi.mock("../layers/dms-layout/app/build/components/layout/Footer.vue", () => ({
  default: { render: () => null },
}));

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

let storage: Map<string, string>;
let user: Ref<object | null>;
let toasts: Ref<object[]>;
let visibility: DocumentVisibilityState;
let app: App | undefined;
let host: HTMLDivElement;

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { label: { type: String, default: undefined } },
  emits: ["click"],
  setup:
    (props, { attrs, emit }) =>
    () =>
      h(
        "button",
        {
          type: "button",
          "data-action": attrs["data-action"],
          "aria-label": attrs["aria-label"],
          onClick: () => emit("click"),
        },
        props.label,
      ),
});

const memoryStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

async function mount(component: Component = GithubStarPrompt): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(component);
  app.component("UButton", ButtonStub);
  app.component("UIcon", { render: () => null });
  app.component("DmsIconWell", { render: () => null });
  app.component("DmsAppLogo", { render: () => null });
  app.mount(host);
  await nextTick();
}

function prompt(): HTMLElement | null {
  return host.querySelector('[role="dialog"]');
}

async function click(action: string): Promise<void> {
  host.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  await nextTick();
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await nextTick();
}

async function setVisibility(state: DocumentVisibilityState): Promise<void> {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
  await nextTick();
}

function seedActiveTime(ms: number): void {
  storage.set(GITHUB_STAR_PROMPT_KEYS.activeMs, String(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", true);
  storage = new Map();
  user = ref({ email: "user@example.com" });
  toasts = ref([]);
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  vi.stubGlobal("localStorage", memoryStorage);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useCurrentUser", () => ({ user }));
  vi.stubGlobal("useToast", () => ({ toasts }));
  vi.stubGlobal("useColorModePreference", () => ref("system"));
  vi.stubGlobal("open", vi.fn());
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GithubStarPrompt", () => {
  it("stays hidden before 15 minutes of use", async () => {
    await mount();
    await advance(GITHUB_STAR_PROMPT_DELAY_MS - GITHUB_STAR_PROMPT_TICK_MS);

    expect(prompt()).toBeNull();
    expect(Number(storage.get(GITHUB_STAR_PROMPT_KEYS.activeMs))).toBe(
      GITHUB_STAR_PROMPT_DELAY_MS - GITHUB_STAR_PROMPT_TICK_MS,
    );
  });

  it("shows in dev mode after 15 minutes of visible time, added up across sessions", async () => {
    seedActiveTime(10 * MINUTE_MS);
    await mount();
    await advance(4 * MINUTE_MS);
    expect(prompt()).toBeNull();

    await advance(MINUTE_MS);

    expect(prompt()).not.toBeNull();
    expect(prompt()!.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("does not count the time the tab is hidden", async () => {
    seedActiveTime(14 * MINUTE_MS);
    await mount();
    await setVisibility("hidden");
    await advance(HOUR_MS);
    expect(prompt()).toBeNull();

    await setVisibility("visible");
    await advance(MINUTE_MS);

    expect(prompt()).not.toBeNull();
  });

  it("hides on Later and shows again 48 hours after", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    await mount();
    expect(prompt()).not.toBeNull();

    await click("later");

    expect(prompt()).toBeNull();
    expect(Number(storage.get(GITHUB_STAR_PROMPT_KEYS.snoozedUntil))).toBe(
      Date.now() + GITHUB_STAR_PROMPT_SNOOZE_MS,
    );
    await advance(GITHUB_STAR_PROMPT_SNOOZE_MS - HOUR_MS);
    expect(prompt()).toBeNull();

    await advance(HOUR_MS);
    expect(prompt()).not.toBeNull();
  });

  it("opens the repository on star, and never shows again", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    await mount();

    await click("star");

    expect(window.open).toHaveBeenCalledWith(
      GITHUB_REPOSITORY_URL,
      "_blank",
      "noopener,noreferrer",
    );
    expect(prompt()).toBeNull();
    expect(storage.get(GITHUB_STAR_PROMPT_KEYS.dismissed)).toBe("1");

    app!.unmount();
    host.remove();
    await mount();
    await advance(GITHUB_STAR_PROMPT_SNOOZE_MS);
    expect(prompt()).toBeNull();
  });

  it("treats the close button as never show again", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    await mount();

    await click("close");

    expect(prompt()).toBeNull();
    expect(storage.get(GITHUB_STAR_PROMPT_KEYS.dismissed)).toBe("1");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("follows a choice made in another tab", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    await mount();

    storage.set(GITHUB_STAR_PROMPT_KEYS.dismissed, "1");
    await advance(GITHUB_STAR_PROMPT_TICK_MS);

    expect(prompt()).toBeNull();
  });

  // The time and the choices then last as long as the page.
  it("does not crash when storage throws", async () => {
    vi.stubGlobal("localStorage", throwingStorage);
    await mount();
    await advance(GITHUB_STAR_PROMPT_DELAY_MS - GITHUB_STAR_PROMPT_TICK_MS);
    expect(prompt()).toBeNull();
    await advance(GITHUB_STAR_PROMPT_TICK_MS);
    expect(prompt()).not.toBeNull();

    await click("later");
    await advance(GITHUB_STAR_PROMPT_TICK_MS);
    expect(prompt()).toBeNull();

    await advance(GITHUB_STAR_PROMPT_SNOOZE_MS);
    await click("close");
    await advance(GITHUB_STAR_PROMPT_SNOOZE_MS);
    expect(prompt()).toBeNull();
  });

  it("steps aside while a toast is up", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    toasts.value = [{ id: 1 }];
    await mount();
    expect(prompt()).toBeNull();

    toasts.value = [];
    await nextTick();
    expect(prompt()).not.toBeNull();
  });

  it("renders nothing without a signed-in user", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    user.value = null;
    await mount();

    expect(prompt()).toBeNull();
  });

  it("is not part of the auth pages' layout", async () => {
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    await mount(EmptyLayout);

    expect(prompt()).toBeNull();
  });

  it("never shows outside dev mode, nor counts or stores anything", async () => {
    vi.stubEnv("DEV", false);
    const setItem = vi.spyOn(memoryStorage, "setItem");
    await mount();
    await advance(GITHUB_STAR_PROMPT_DELAY_MS);
    seedActiveTime(GITHUB_STAR_PROMPT_DELAY_MS);
    await advance(GITHUB_STAR_PROMPT_TICK_MS);

    expect(prompt()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
