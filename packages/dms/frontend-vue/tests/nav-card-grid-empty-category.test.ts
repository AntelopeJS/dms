// @vitest-environment jsdom
import { createApp, h, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DmsLink } from "#dms/frontend-module";
import NavCardGridBlock from "../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { stubBlockRuntime } from "./helpers/block-runtime";

const page = (fullId: string, extra: Record<string, unknown> = {}) => ({
  fullId,
  displayName: fullId,
  fullSlug: `/${fullId.replaceAll(".", "/")}`,
  layoutUrl: `/${fullId}/pagelayout`,
  children: {},
  ...extra,
});
let pages: ReturnType<typeof page>[];
let app: App | undefined;

function mountGrid(props: Record<string, unknown>): HTMLElement {
  app = createApp({
    render: () =>
      h(NavCardGridBlock, {
        componentId: "grid",
        pageId: "settings",
        ...props,
      }),
  });
  app.component("DmsLink", DmsLink);
  app.component("UIcon", () => null);
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

beforeEach(async () => {
  useRealDataEngine();
  await stubBlockRuntime(vi.fn());
  pages = [];
  const category = () => ({
    children: Object.fromEntries(pages.map((entry) => [entry.fullId, entry])),
  });
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayoutTree: ref({
      children: {
        settings: { children: { workspace: category(), user: category() } },
      },
    }),
  }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useI18n", () => ({ t: String, locale: ref("en") }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it("leaves out a category grid whose pages the viewer opens none of", () => {
  pages = [page("settings.workspace.members", { hasAccess: false })];
  const container = mountGrid({
    categoryId: "settings.workspace",
    title: "Workspace",
  });
  expect(container.querySelector("section")).toBeNull();
});

it("lists the pages of the category the viewer can open", () => {
  pages = [page("settings.workspace.members", { displayName: "Members" })];
  const container = mountGrid({
    categoryId: "settings.workspace",
    title: "Workspace",
  });
  expect(container.textContent).toContain("Workspace");
  expect(
    [...container.querySelectorAll("a")].map((link) => [
      link.getAttribute("href"),
      link.textContent?.trim(),
    ]),
  ).toEqual([["/settings/workspace/members", "Members"]]);
});

it("says what the page asks for when there is nothing to list", () => {
  const container = mountGrid({
    categoryId: "settings.workspace",
    empty: { title: "Nothing here" },
  });
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Nothing here",
  );
});

it("hands each card its page's badge for the corner, not as a state line", () => {
  pages = [
    page("settings.user.security", {
      displayName: "Security",
      badge: "1",
      badgeTone: "warning",
    }),
  ];
  const container = mountGrid({ categoryId: "settings.user" });
  const card = container.querySelector("a");
  expect(card?.textContent).toContain("Security");
  expect(
    [...card!.querySelectorAll("span")].some(
      (span) => span.textContent?.trim() === "1",
    ),
  ).toBe(true);
  expect(card?.querySelector(".text-warning")?.textContent?.trim()).toBe("1");
  expect(card?.querySelector('[role="status"]')).toBeNull();
});
