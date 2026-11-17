import { expect } from "chai";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { optionsOf, OrderAPI } from "./table-view-reduced-chrome.fixture";

describe("[unit] interfaces/dms-base — table view expandable rows, tabs and row actions", () => {
  it("hands the band to a component alone, refusing both or neither", () => {
    const component = CustomComponent("OrderLines");
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: { component, single: true },
      }),
    );
    expect(options.expandable).to.deep.equal({
      defaultExpanded: undefined,
      single: true,
      lazyLoad: undefined,
      component: component.serializeSync(),
    });

    const both = {
      component,
      fields: ["carrier"],
    };
    expect(() =>
      TableView(OrderAPI, { realtime: false, expandable: both }),
    ).to.throw(/both fields and a component/);
    const neither = { single: true };
    expect(() =>
      TableView(OrderAPI, { realtime: false, expandable: neither }),
    ).to.throw(/neither fields nor a component/);
  });
});
