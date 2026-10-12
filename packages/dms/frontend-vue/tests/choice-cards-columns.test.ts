/**
 * Choice cards sit two per row once the field is wide enough; `columns` sets
 * how many, so three options fit one row instead of wrapping 2 + 1.
 */
import { computed, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChoiceCards from "../layers/dms-ui/app/components/form/components/ChoiceCards.vue";

const Group = defineComponent({
  props: { ui: { type: Object, default: undefined } },
  setup: (props) => () =>
    h("fieldset", { class: (props.ui as { fieldset?: string })?.fieldset }),
});

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(ChoiceCards, {
        items: [
          { label: "30 days", value: 30 },
          { label: "90 days", value: 90 },
          { label: "365 days", value: 365 },
        ],
        modelValue: 30,
        ...props,
      }),
  });
  app.component("URadioGroup", Group);
  app.component("UCheckboxGroup", Group);
  return renderToString(app);
}

// A Nuxt auto-import, which ChoiceCards.vue uses unimported.
beforeEach(() => vi.stubGlobal("computed", computed));
afterEach(() => vi.unstubAllGlobals());

describe("ChoiceCards columns", () => {
  it("lays the cards on a grid whose column count is a custom property", async () => {
    const html = await render({});
    expect(html).toContain(
      "@min-[480px]:grid-cols-[repeat(var(--dms-choice-columns),minmax(0,1fr))]",
    );
  });

  it("keeps two cards per row by default", async () => {
    expect(await render({})).toContain("--dms-choice-columns:2");
  });

  it("puts `columns` cards per row", async () => {
    expect(await render({ columns: 3 })).toContain("--dms-choice-columns:3");
  });

  it("keeps at least one whole column", async () => {
    expect(await render({ columns: 0 })).toContain("--dms-choice-columns:1");
    expect(await render({ columns: 2.6, multiple: true })).toContain(
      "--dms-choice-columns:3",
    );
  });
});
