/** @vitest-environment jsdom */
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRowSidePanelContent } from "../layers/dms-layout/app/build/composables/layout/rowSidePanel";
import { isRowClickTrigger } from "../layers/dms-ui/app/build/utils/rowClickTrigger";
import { resolveRowClickAction } from "../layers/dms-ui/app/utils/rowClickAction";
import { isString } from "../layers/dms-core/app/utils/type-check";
import {
  rows,
  panelAction,
  mountPanel,
  settle,
  query,
  press,
} from "./row-side-panel-runtime";

describe("row tokens in a row panel's component options", () => {
  let loadedRowIds: Array<string | undefined> = [];
  const BlockPanel = defineComponent({
    props: {
      fetchUrl: { type: String, default: undefined },
      rowId: { type: String, default: undefined },
      heading: {
        type: Object,
        default: undefined,
      },
    },
    setup(props) {
      loadedRowIds.push(props.rowId);
      return () =>
        h("p", { "data-block": "" }, [
          `${props.fetchUrl}|${props.rowId}|${props.heading?.text}`,
        ]);
    },
  });
  const blockAction = () =>
    panelAction({
      component: {
        componentName: "BlockPanel",
        options: {
          fetchUrl: "/api/runs/get?id={{row._id}}&site={{query.site}}",
          rowId: "{{row.id}}",
          heading: { text: "{{row.name}} run" },
        },
      },
    });
  const shownBlock = (host: ParentNode) =>
    query(host, "[data-block]")?.textContent?.trim();

  beforeEach(() => {
    loadedRowIds = [];
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "BlockPanel" ? BlockPanel : undefined,
    );
  });

  it("fills them on a click on a row, before any ?record= is written", async () => {
    const { host, targets } = mountPanel();
    const action = blockAction();

    const row = document.createElement("tr");
    row.addEventListener("click", (event) => {
      if (!isRowClickTrigger("single", event)) return;
      const clicked = resolveRowClickAction({ custom: [action] }, rows[1]!);
      if (clicked && !isString(clicked))
        targets.handleCustomRowAction(clicked, rows[1]);
    });
    document.body.append(row);
    expect(window.location.search).toBe("");
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await settle();
    expect(loadedRowIds).toEqual(["r2"]);
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r2&site={{query.site}}|r2|Second run",
    );
    expect(window.location.search).toBe("?record=r2");
  });

  it("fills them with the row shown, again on each step and showRow", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(blockAction(), rows[0]);
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r1&site={{query.site}}|r1|First run",
    );
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r2&site={{query.site}}|r2|Second run",
    );
    press("j");
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r3&site={{query.site}}|r3|Third run",
    );
    await useRowSidePanelContent().value?.showRow?.(rows[0]!);
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r1&site={{query.site}}|r1|First run",
    );
  });

  it("encodes a URL option's value, and leaves another as it is", async () => {
    const { host, targets } = mountPanel(ref([{ _id: "a b", name: "A/B" }]));
    targets.handleCustomRowAction(blockAction(), { _id: "a b", name: "A/B" });
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=a%20b&site={{query.site}}|a b|A/B run",
    );
  });
});

describe("a container block as a row panel's component", () => {
  const CardStub = defineComponent({
    props: {
      title: { type: String, default: undefined },
      rowData: { type: Object, default: undefined },
    },
    setup(props, { slots }) {
      return () =>
        h("section", { "data-card": "" }, [
          h("h3", `${props.title}|${props.rowData?.name}`),
          h("div", { "data-body": "" }, slots.default?.()),
          h("footer", slots.footer?.()),
        ]);
    },
  });
  const StackStub = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", { "data-stack": "" }, slots.default?.()),
  });
  const FactsStub = defineComponent({
    props: { fetchUrl: { type: String, default: undefined } },
    setup: (props) => () => h("dl", { "data-facts": "" }, props.fetchUrl),
  });
  const blocks = new Map(Object.entries({ CardStub, StackStub, FactsStub }));
  const cardAction = () =>
    panelAction({
      component: {
        componentName: "CardStub",
        options: { title: "{{row.name}} facts" },
        children: [
          {
            id: "facts",
            component: {
              componentName: "FactsStub",
              options: { fetchUrl: "/x/{{row._id}}" },
            },
          },
          {
            id: "stack",
            component: {
              componentName: "StackStub",
              children: [
                {
                  id: "nested",
                  component: {
                    componentName: "FactsStub",
                    options: { fetchUrl: "/y/{{row.id}}?name={{row.name}}" },
                  },
                },
              ],
            },
          },
          {
            id: "note",
            slot: "footer",
            component: {
              componentName: "FactsStub",
              options: { fetchUrl: "/notes/{{row._id}}" },
            },
          },
        ],
      },
    });
  const shownCard = (host: ParentNode) => ({
    heading: query(host, "[data-card] h3")?.textContent,
    body: [...host.querySelectorAll("[data-body] [data-facts]")].map(
      (facts) => facts.textContent,
    ),
    nested: query(host, "[data-stack] [data-facts]")?.textContent,
    footer: query(host, "[data-card] footer [data-facts]")?.textContent,
  });

  beforeEach(() => {
    vi.stubGlobal("resolveDmsComponent", (name: string) => blocks.get(name));
  });

  it("mounts its children, filled with the row shown, again on each step", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(cardAction(), rows[0]);
    await settle();
    expect(shownCard(host)).toEqual({
      heading: "First facts|First",
      body: ["/x/r1", "/y/r1?name=First"],
      nested: "/y/r1?name=First",
      footer: "/notes/r1",
    });
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(shownCard(host)).toEqual({
      heading: "Second facts|Second",
      body: ["/x/r2", "/y/r2?name=Second"],
      nested: "/y/r2?name=Second",
      footer: "/notes/r2",
    });
  });
});
