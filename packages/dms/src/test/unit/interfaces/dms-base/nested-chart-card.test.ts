// A page is a class carrying only static component fields — that is the shape the decorator consumes.

import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as realtimeImpl from "../../../../implementations/dms/realtime";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as realtimeInterface from "@antelopejs/interface-dms/realtime";
import { ChartArea } from "@antelopejs/interface-dms/base/chart";
import { ChartCard } from "@antelopejs/interface-dms/base/chart-card";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
// From the leaf, not the `realtime` barrel: the barrel constructs brokers and
// installs the table-view bridge at import time, which a Map lookup does not need.
import { getPageTopics } from "../../../../realtime/registry";

const PAGE_ID = "ncc-dashboard";
const PAGE_FULL_ID = `pages.${PAGE_ID}`;
const TOPIC = "ncc:sales";

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// The shape the playground dashboards use: the chart that carries the realtime
// topic sits three levels below the page's own component.
class DashboardPage extends PageController(PAGE_ID, {
  displayName: "Nested chart dashboard",
  category: pagesCategory,
}) {
  static salesGroup = Grid({ gap: "1rem" }).child(
    "row",
    GridRow().child(
      "salesChart",
      ChartCard({
        title: "Sales over time",
        fetchUrl: "/api/dashboard/sales",
        chart: ChartArea({
          xaxisType: "datetime",
          realtimeTopic: TOPIC,
        }),
      }),
    ),
  );
}

describe("[unit] interfaces/dms-base — a chart nested in a card", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(realtimeInterface, realtimeImpl);
    ImplementInterface(pageInterface, pageImpl);

    RegisterPage()(DashboardPage);
    await settle();
  });

  after(() => {
    const { pageInfo } = GetMetadata(DashboardPage, PageMetadata);
    if (pageInfo) pageInterface.internal.RegisterPage.unregister(pageInfo);
  });

  it("registers the realtime topic of a deeply nested component", () => {
    expect([...getPageTopics(PAGE_FULL_ID)]).to.deep.equal([TOPIC]);
  });
});
