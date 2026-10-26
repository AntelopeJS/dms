/** @vitest-environment jsdom */
/**
 * A long sectioned form groups its navigation under headings: the sections
 * naming the same `navGroup` one after the other share one, in the side list
 * and in the row of chips alike. Without a group, the chips stay one row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h, nextTick } from "vue";
import {
  groupSectionsForNav,
  layoutSections,
} from "../layers/dms-ui/app/entries/composables/form/formSections";
import FormSectionNav from "../layers/dms-ui/app/entries/components/form/FormSectionNav";

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

const plainLayout = layoutSections(
  [field("a"), field("b")],
  [
    { id: "a", label: "A", fieldIds: ["a"] },
    { id: "b", label: "B", fieldIds: ["b"] },
  ],
);

type NavProps = Partial<InstanceType<typeof FormSectionNav>["$props"]>;

async function mount(variant: "list" | "chips", props: NavProps = {}) {
  app = createApp({
    render: () =>
      h(FormSectionNav, {
        variant,
        sections: layout.sections,
        states: {},
        anchorId: (id: string) => `form-${id}`,
        ...props,
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
    expect(groupSectionsForNav(plainLayout.sections)).toHaveLength(1);
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
});

function labelledRuns(): [string | undefined, string[]][] {
  return [...host.querySelectorAll("ul")].map((list) => {
    const id = list.getAttribute("aria-labelledby");
    const label = id
      ? document.getElementById(id)?.textContent?.trim()
      : undefined;
    const chips = [...list.querySelectorAll("a")].map(
      (chip) => chip.textContent?.trim() ?? "",
    );
    return [label, chips];
  });
}

describe("the row of chips", () => {
  it("leads each run of chips with its group's label", async () => {
    await mount("chips");
    expect(labelledRuns()).toEqual([
      [undefined, ["Plan"]],
      ["t($billing)", ["Dunning", "Tax"]],
      ["Legal", ["Terms"]],
    ]);
  });

  it("wraps the runs instead of scrolling one line", async () => {
    await mount("chips");
    const nav = host.querySelector("nav")!;
    expect(nav.classList.contains("flex-wrap")).toBe(true);
    for (const list of host.querySelectorAll("ul")) {
      expect(list.classList.contains("overflow-x-auto")).toBe(false);
    }
  });

  it("keeps a form without groups in one scrolling row", async () => {
    await mount("chips", { sections: plainLayout.sections });
    expect(host.querySelectorAll("ul")).toHaveLength(1);
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.querySelector("[aria-labelledby]")).toBeNull();
    expect(host.querySelector("p")).toBeNull();
    expect(host.querySelector("ul")!.className).toBe(
      "flex gap-1.5 overflow-x-auto pb-1",
    );
  });

  it("links each chip to its section and reports the one chosen", async () => {
    const selected: string[] = [];
    await mount("chips", {
      activeId: "tax",
      onSelect: (id: string) => selected.push(id),
    });
    const chips = [...host.querySelectorAll("a")];
    expect(chips.map((chip) => chip.getAttribute("href"))).toEqual([
      "#form-plan",
      "#form-dunning",
      "#form-tax",
      "#form-terms",
    ]);
    expect(
      host.querySelector("[aria-current='location']")?.textContent?.trim(),
    ).toBe("Tax");
    chips[3]!.click();
    expect(selected).toEqual(["terms"]);
  });
});
