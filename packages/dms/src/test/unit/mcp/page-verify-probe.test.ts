import { expect } from "chai";
import { JSDOM } from "jsdom";
import { probePage } from "../../../mcp/page-verify";

const installed: string[] = [];

function installDom(dom: JSDOM): void {
  const { window } = dom;
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    Node: window.Node,
    SVGElement: window.SVGElement,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
    installed.push(name);
  }
}

function removeDom(): void {
  for (const name of installed.splice(0)) {
    Reflect.deleteProperty(globalThis, name);
  }
}

async function productionVue(): Promise<typeof import("vue")> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    return await import("vue");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

describe("[unit] mcp page_verify probe", () => {
  afterEach(removeDom);

  it("finds the blocks of an app mounted from Vue's production build, which keeps no app instance", async () => {
    const dom = new JSDOM('<!doctype html><div id="app"></div>');
    installDom(dom);
    const { createApp, defineComponent, h } = await productionVue();
    const Block = defineComponent({
      props: ["layoutPath", "componentId", "pageId", "component"],
      setup: () => () => h("section"),
    });
    const app = createApp({
      setup: () => () =>
        h("main", [
          h(Block, {
            layoutPath: "table",
            componentId: "table",
            pageId: "users",
            component: { componentName: "dms-table-view" },
          }),
        ]),
    });
    app.mount("#app");

    const probe = await probePage({ evaluate: async (fn) => fn() });

    expect(app._instance).to.equal(null);
    expect(
      probe.blocks.map(({ path, componentName }) => ({ path, componentName })),
    ).to.deep.equal([{ path: "table", componentName: "dms-table-view" }]);
    expect(
      dom.window.document
        .querySelector("section")
        ?.getAttribute("data-page-verify-path"),
    ).to.equal("table");
  });
});
