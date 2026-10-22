import { createSSRApp, defineComponent, h, ref, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";
import StatGroup from "../layers/dms-ui/app/components/stat-group/StatGroup.vue";
import NavCard from "../layers/dms-ui/app/components/card/NavCard.vue";

// A detail or a title cut on its first line loses what it says: a stat
// group's details and a nav card's title take two lines before the ellipsis.

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function render(component: Component, props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(component, props) });
  for (const name of ["UIcon", "USkeleton", "DmsLink"]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeAll(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

const DETAIL = "Next invoice on Nov 1 for the three seats left";

function detailClasses(html: string): string {
  const element = new RegExp(
    `<(?:p|small) class="([^"]*)"[^>]*>\\s*${DETAIL}`,
  ).exec(html);
  return element?.[1] ?? "";
}

describe("StatGroup detail", () => {
  it.each(["joined", "cards"])(
    "gives a %s cell's detail two lines before its ellipsis",
    async (layout) => {
      const html = await render(StatGroup, {
        layout,
        items: [{ eyebrow: "Billing", value: "On", detail: DETAIL }],
      });
      expect(detailClasses(html)).toContain("line-clamp-2");
      expect(detailClasses(html)).not.toContain("truncate");
    },
  );
});

describe("NavCard title", () => {
  it("takes two lines before its ellipsis", async () => {
    const html = await render(NavCard, {
      to: "/workspaces?view=past-due",
      icon: "i-ph-warning",
      title: "Workspaces past due for more than seven days",
    });
    const title = /<h3 class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(title).toContain("line-clamp-2");
    expect(title).not.toContain("truncate");
  });
});

describe("StatGroup columnsFrom", () => {
  const items = ["Template", "Locale", "Latency"].map((eyebrow) => ({
    eyebrow,
    value: "—",
  }));
  // The column classes of the group's grid, whatever their order.
  const columnClasses = (html: string) =>
    (/<div class="([^"]*\bgrid\b[^"]*)"/.exec(html)?.[1] ?? "")
      .split(" ")
      .filter((name) => name.includes("grid-cols-"))
      .sort();

  it("sets all the columns side by side from the given group width", async () => {
    const html = await render(StatGroup, {
      layout: "joined",
      columns: 3,
      columnsFrom: "md",
      items,
    });
    expect(columnClasses(html)).toEqual(["@md:grid-cols-3", "grid-cols-1"]);
  });

  it("keeps the usual steps without it", async () => {
    const html = await render(StatGroup, {
      layout: "joined",
      columns: 3,
      items,
    });
    expect(columnClasses(html)).toEqual(["@xl:grid-cols-3", "grid-cols-1"]);
  });

  it("keeps the narrow count of cards", async () => {
    const html = await render(StatGroup, {
      layout: "cards",
      columns: 4,
      columnsFrom: "lg",
      items: [...items, { eyebrow: "Opens", value: 3 }],
    });
    expect(columnClasses(html)).toEqual(["@lg:grid-cols-4", "grid-cols-2"]);
  });
});
