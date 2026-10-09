// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  type App,
} from "vue";
import ProfileSecuritySummary from "../layers/dms-layout/app/build/components/pages/settings/profile/ProfileSecuritySummary.vue";

// The profile's "Sign-in and security" row takes the tone of the Security
// page's navigation badge, the one the server weighs what needs attention
// with: red when the backup codes run low, amber for two-factor off or codes
// not saved, quiet when nothing needs attention.

const overview = ref<Record<string, unknown> | null>(null);
const attention = ref<string[]>([]);
const attentionTone = ref<string | undefined>(undefined);

vi.mock(
  "../layers/dms-layout/app/build/composables/settings/security/useSecurityOverview",
  () => ({
    SECURITY_PAGE_PATH: "/settings/user/security",
    useSecurityOverview: () => ({
      overview,
      attention,
      attentionTone,
      isUnavailable: ref(false),
      refresh: vi.fn(),
    }),
  }),
);
vi.mock("#dms-ui/app/components/icon-well/IconWell.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: { icon: String, tone: String },
      setup: (props) => () =>
        h("span", { "data-icon": props.icon, "data-tone": props.tone }),
    }),
  };
});

let app: App | undefined;
let host: HTMLDivElement;

const OVERVIEW = {
  activeSessions: 9,
  twoFactor: { methods: ["totp"] },
};

const wellTone = () =>
  host.querySelector("[data-icon]")?.getAttribute("data-tone");

function show(items: string[], tone: string | undefined): void {
  overview.value = OVERVIEW;
  attention.value = items;
  attentionTone.value = tone;
}

beforeEach(() => {
  overview.value = null;
  attention.value = [];
  attentionTone.value = undefined;
  Object.entries({ computed, onMounted }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(ProfileSecuritySummary);
  app.component(
    "USkeleton",
    defineComponent({ setup: () => () => h("span", { "data-skeleton": "" }) }),
  );
  app.component("UButton", defineComponent({ setup: () => () => h("a") }));
  app.mount(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

it("turns red when the server weighs the attention an error", async () => {
  show(["backup_codes_low", "backup_codes_unsaved"], "error");
  await nextTick();
  expect(wellTone()).toBe("error");
});

it("stays amber for two-factor off", async () => {
  show(["two_factor_off"], "warning");
  await nextTick();
  expect(wellTone()).toBe("warning");
});

it("is quiet when nothing needs attention", async () => {
  show([], undefined);
  await nextTick();
  expect(wellTone()).toBe("muted");
  expect(host.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
    "i-ph-shield-check",
  );
});

it("names every point that needs attention, not only the first", async () => {
  show(["backup_codes_low", "backup_codes_unsaved"], "error");
  await nextTick();
  expect(host.textContent).toContain(
    "page.settings.profile.security_attention — page.settings.security.attention.backup_codes_low and page.settings.security.attention.backup_codes_unsaved.",
  );
});
