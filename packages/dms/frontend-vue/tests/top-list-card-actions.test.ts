/**
 * A TopListCard's head carries link buttons ("Catalogue →") after its period
 * badge, quiet like an ActivityFeed's; a card without them draws its head as
 * before.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartRuntime } from "./helpers/charts-runtime";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const Button = defineComponent({
  props: { label: String, to: String, variant: String, color: String },
  setup: (props) => () =>
    h(
      "a",
      {
        "data-button": "",
        href: props.to,
        "data-variant": props.variant,
        "data-color": props.color,
      },
      props.label,
    ),
});

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(TopListCard, {
        title: "Top plans",
        componentId: "plans",
        pageId: "dashboard",
        fetchUrl: "/plans",
        ...props,
      }),
  });
  for (const name of ["DmsCard", "UBadge", "UIcon", "USkeleton"]) {
    app.component(name, Slot);
  }
  app.component("UButton", Button);
  app.component("DmsTopListRow", Slot);
  await chartRuntime(app, { items: [{ id: "pro", title: "Pro", value: 12 }] });
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-US"),
    t: (key: string) => `t($${key})`,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("TopListCard actions", () => {
  it("draws its link buttons in the head, quiet and translated", async () => {
    const html = await render({
      actions: [
        {
          label: "$dashboard.catalogue",
          to: "/plans",
          icon: "i-ph-arrow-right",
        },
      ],
    });
    const button = /<a data-button[^>]*href="\/plans"[^>]*>([^<]*)<\/a>/.exec(
      html,
    );
    expect(button?.[1]).toBe("t($dashboard.catalogue)");
    expect(button?.[0]).toContain('data-variant="ghost"');
    expect(button?.[0]).toContain('data-color="neutral"');
  });

  it("draws no button without actions", async () => {
    expect(await render({})).not.toContain("data-button");
  });
});
