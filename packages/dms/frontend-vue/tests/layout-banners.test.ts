// @vitest-environment jsdom
import {
  computed,
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardBanners from "../layers/dms-layout/app/build/components/layout/DashboardBanners.vue";
import {
  resolveLayoutBannerPresentation,
  useLayoutBanners,
} from "../layers/dms-layout/app/composables/layout/useLayoutBanners";
import type {
  LayoutBanner,
  LayoutBannerVariant,
  SiteLayout,
} from "../layers/dms-layout/app/types/page";

const DISMISSED_BANNERS_COOKIE = "dms-dismissed-banners";

const siteLayout = ref<SiteLayout | undefined>();
let dismissedCookie: Ref<string[]>;
const cookieNames: string[] = [];

const banner = (extra: Partial<LayoutBanner> = {}): LayoutBanner => ({
  key: "banner",
  variant: "info",
  order: 0,
  dismissible: false,
  text: "Heads up",
  ...extra,
});

function serveBanners(banners: LayoutBanner[] | undefined): void {
  siteLayout.value = { pages: {}, categories: {}, banners };
}

// Renders what the real alert exposes to the banner: its description slot and
// a close button that reports the alert closed.
const AlertStub = defineComponent({
  props: {
    color: { type: String, default: undefined },
    icon: { type: String, default: undefined },
    close: { type: Boolean, default: false },
  },
  emits: ["update:open"],
  setup:
    (props, { slots, emit }) =>
    () =>
      h("div", { "data-color": props.color, "data-icon": props.icon }, [
        slots.description?.(),
        props.close
          ? h("button", { onClick: () => emit("update:open", false) }, "close")
          : null,
      ]),
});

const BannerContent = defineComponent({
  props: { days: { type: Number, required: true } },
  setup: (props) => () => h("strong", `${props.days} days left`),
});

function mountable(root: App): App {
  root.component("UAlert", AlertStub);
  root.component("BannerContent", BannerContent);
  return root;
}

beforeEach(() => {
  siteLayout.value = undefined;
  cookieNames.length = 0;
  dismissedCookie = ref<string[]>([]);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useSiteLayout", () => ({ siteLayout }));
  vi.stubGlobal("useDmsCookie", (name: string) => {
    cookieNames.push(name);
    return dismissedCookie;
  });
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key.replace(/^\$/, "t:"),
  }));
  vi.stubGlobal("useLayoutBanners", useLayoutBanners);
  vi.stubGlobal(
    "resolveLayoutBannerPresentation",
    resolveLayoutBannerPresentation,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveLayoutBannerPresentation", () => {
  it.each([
    ["info", "status"],
    ["warning", "status"],
    ["error", "alert"],
  ] as const)("announces a %s banner as %s", (variant, role) => {
    const presentation = resolveLayoutBannerPresentation(banner({ variant }));
    expect(presentation.role).toBe(role);
    expect(presentation.color).toBe(variant);
  });

  it("renders an unknown variant as info rather than unstyled", () => {
    const presentation = resolveLayoutBannerPresentation(
      banner({ variant: "success" as LayoutBannerVariant }),
    );
    expect(presentation).toEqual(
      resolveLayoutBannerPresentation(banner({ variant: "info" })),
    );
  });

  it("keeps the banner's own icon over the variant's", () => {
    expect(
      resolveLayoutBannerPresentation(banner({ icon: "i-ph-clock" })).icon,
    ).toBe("i-ph-clock");
  });
});

describe("useLayoutBanners", () => {
  it("serves nothing for a backend that predates banners", () => {
    serveBanners(undefined);
    expect(useLayoutBanners().banners.value).toEqual([]);
  });

  it("drops a dismissed banner, and remembers the dismissal in the cookie", () => {
    serveBanners([
      banner({ key: "a", dismissible: true }),
      banner({ key: "b", dismissible: true }),
    ]);
    const { banners, dismiss } = useLayoutBanners();

    dismiss("a");
    dismiss("a");

    expect(cookieNames).toEqual([DISMISSED_BANNERS_COOKIE]);
    expect(dismissedCookie.value).toEqual(["a"]);
    expect(banners.value.map((entry) => entry.key)).toEqual(["b"]);
  });

  // A banner that turned non-dismissible (an overdue invoice) must show again
  // even to a user who closed its dismissible predecessor under the same key.
  it("ignores a dismissal for a banner that is not dismissible", () => {
    dismissedCookie.value = ["a"];
    serveBanners([banner({ key: "a", dismissible: false })]);
    expect(useLayoutBanners().banners.value).toHaveLength(1);
  });
});

describe("DashboardBanners", () => {
  it("server-renders the banners in order, each with its variant's role", async () => {
    serveBanners([
      banner({ key: "billing", variant: "error", text: "$billing.overdue" }),
      banner({
        key: "trial",
        variant: "warning",
        component: "BannerContent",
        props: { days: 3 },
        text: undefined,
      }),
      banner({ key: "news", variant: "info", text: "New release" }),
    ]);

    const html = await renderToString(
      mountable(createSSRApp(DashboardBanners)),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const rendered = [
      ...document.querySelectorAll("[data-dms-layout-banner]"),
    ].map((node) => ({
      key: node.getAttribute("data-dms-layout-banner"),
      role: node.getAttribute("role"),
      text: node.textContent,
    }));

    expect(rendered).toEqual([
      { key: "billing", role: "alert", text: "t:billing.overdue" },
      { key: "trial", role: "status", text: "3 days left" },
      { key: "news", role: "status", text: "New release" },
    ]);
  });

  // The server reads the same cookie, so a dismissed banner never reaches the
  // page only to be removed on hydration.
  it("leaves a dismissed banner out of the server-rendered page", async () => {
    dismissedCookie.value = ["news"];
    serveBanners([banner({ key: "news", dismissible: true })]);

    const html = await renderToString(
      mountable(createSSRApp(DashboardBanners)),
    );
    expect(html).not.toContain("data-dms-layout-banners");
  });

  it("offers a close button only on a dismissible banner, and closes it", async () => {
    serveBanners([
      banner({ key: "sticky" }),
      banner({ key: "closable", dismissible: true }),
    ]);
    const host = document.createElement("div");
    const app = mountable(createApp(DashboardBanners));
    app.mount(host);

    const buttons = host.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    buttons[0]!.click();
    await nextTick();

    expect(dismissedCookie.value).toEqual(["closable"]);
    expect(
      [...host.querySelectorAll("[data-dms-layout-banner]")].map((node) =>
        node.getAttribute("data-dms-layout-banner"),
      ),
    ).toEqual(["sticky"]);
    app.unmount();
  });
});
