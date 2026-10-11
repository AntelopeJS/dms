// @vitest-environment jsdom
/**
 * A long sectioned form groups its side navigation under headings: the
 * sections naming the same `navGroup` one after the other share one. The
 * row of chips lists every section without them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h, nextTick } from "vue";
import {
  groupSectionsForNav,
  layoutSections,
} from "../layers/dms-ui/app/build/composables/form/formSections";
import FormSectionNav from "../layers/dms-ui/app/build/components/form/FormSectionNav.vue";

const field = (id: string) => ({
  id,
  component: { componentName: "dms-input-text" },
});

const SECTIONS = [
  { id: "plan", label: "Plan", fieldIds: ["plan"] },
  {
    id: "dunning",
    label: "Dunning",
    navGroup: "$billing",
    fieldIds: ["dunning"],
  },
  { id: "tax", label: "Tax", navGroup: "$billing", fieldIds: ["tax"] },
  { id: "terms", label: "Terms", navGroup: "Legal", fieldIds: ["terms"] },
];

const layout = layoutSections(
  ["plan", "dunning", "tax", "terms"].map(field),
  SECTIONS,
);

let app: App | undefined;
let host: HTMLDivElement;

async function mount(variant: "list" | "chips") {
  app = createApp({
    render: () =>
      h(FormSectionNav, {
        variant,
        sections: layout.sections,
        states: {},
        anchorId: (id: string) => `form-${id}`,
      }),
  });
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => (text.startsWith("$") ? `t(${text})` : text),
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("groupSectionsForNav", () => {
  it("cuts the sections wherever their heading changes", () => {
    expect(
      groupSectionsForNav(layout.sections).map((group) => [
        group.label,
        group.sections.map((section) => section.id),
      ]),
    ).toEqual([
      [undefined, ["plan"]],
      ["$billing", ["dunning", "tax"]],
      ["Legal", ["terms"]],
    ]);
  });

  it("keeps a form without groups in one run", () => {
    const plain = layoutSections(
      [field("a"), field("b")],
      [
        { id: "a", label: "A", fieldIds: ["a"] },
        { id: "b", label: "B", fieldIds: ["b"] },
      ],
    );
    expect(groupSectionsForNav(plain.sections)).toHaveLength(1);
  });
});

describe("the side navigation", () => {
  it("titles each run, and names its list by it", async () => {
    await mount("list");
    const lists = [...host.querySelectorAll("ul")];
    expect(lists).toHaveLength(3);
    expect(lists[0]!.hasAttribute("aria-labelledby")).toBe(false);
    const headings = lists.slice(1).map((list) => {
      const id = list.getAttribute("aria-labelledby")!;
      return document.getElementById(id)?.textContent?.trim();
    });
    expect(headings).toEqual(["t($billing)", "Legal"]);
    expect(lists[1]!.querySelectorAll("li")).toHaveLength(2);
  });

  it("lists the chips in one row, without headings", async () => {
    await mount("chips");
    expect(host.querySelectorAll("ul")).toHaveLength(1);
    expect(host.querySelectorAll("li")).toHaveLength(4);
    expect(host.querySelector("[aria-labelledby]")).toBeNull();
  });
});
