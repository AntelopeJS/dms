import { createSSRApp, defineComponent, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import StatGroup from "../layers/dms-ui/app/components/stat-group/StatGroup.vue";
import NavCard from "../layers/dms-ui/app/components/card/NavCard.vue";

// A detail or a title cut on its first line loses what it says: a StatGroup
// may give its details two lines, and a nav card's title always has two.

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

const DETAIL = "Next invoice on Nov 1 for the three seats left";

function detailClasses(html: string): string {
  const element = new RegExp(
    `<(?:p|small) class="([^"]*)"[^>]*>\\s*${DETAIL}`,
  ).exec(html);
  return element?.[1] ?? "";
}

describe("StatGroup detailLines", () => {
  it.each(["joined", "cards"])(
    "keeps a %s cell's detail on one line by default",
    async (layout) => {
      const html = await render(StatGroup, {
        layout,
        items: [{ eyebrow: "Billing", value: "On", detail: DETAIL }],
      });
      expect(detailClasses(html)).toContain("truncate");
      expect(detailClasses(html)).not.toContain("line-clamp-2");
    },
  );

  it.each(["joined", "cards"])(
    "gives a %s cell's detail two lines when asked",
    async (layout) => {
      const html = await render(StatGroup, {
        layout,
        detailLines: 2,
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
