import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  TableView,
  TableViewRoutes,
  type TableViewTab,
} from "@antelopejs/interface-dms/base/table-view";
import { captureWarnings } from "../../../helpers/logging";

const TABLE = "tab-count-warning-rows";
const MISSING_ROUTE = "count/batch";

const TABS: TableViewTab[] = [
  {
    id: "open",
    label: "Open",
    filters: [{ accessorKey: "status", value: "open", mode: "is" }],
  },
];

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Row extends Table {}

@RegisterDataController()
class CountOnlyAPI extends DataController(
  Row,
  { list: TableViewRoutes.List, count: TableViewRoutes.Count },
  Controller("/api/tab-count-warning/count-only"),
) {}

@RegisterDataController()
class RepeatedAPI extends DataController(
  Row,
  { list: TableViewRoutes.List },
  Controller("/api/tab-count-warning/repeated"),
) {}

@RegisterDataController()
class BatchAPI extends DataController(
  Row,
  { list: TableViewRoutes.List, countBatch: TableViewRoutes.CountBatch },
  Controller("/api/tab-count-warning/batch"),
) {}

// The route is recognised by where it is mounted, not by the key it sits under.
@RegisterDataController()
class RenamedBatchAPI extends DataController(
  Row,
  { list: TableViewRoutes.List, tabCounters: TableViewRoutes.CountBatch },
  Controller("/api/tab-count-warning/renamed"),
) {}

@RegisterDataController()
class NoTabsAPI extends DataController(
  Row,
  { list: TableViewRoutes.List },
  Controller("/api/tab-count-warning/no-tabs"),
) {}

function countBatchWarnings(register: () => void): string[] {
  const captured = captureWarnings();
  try {
    register();
  } finally {
    captured.restore();
  }
  return captured.messages.filter((message) => message.includes(MISSING_ROUTE));
}

describe("[unit] interfaces/dms-base/table-view — filter tabs require countBatch", () => {
  it("warns when a table with tabs is mounted on a controller without countBatch", () => {
    const warnings = countBatchWarnings(() =>
      TableView(CountOnlyAPI, { tabs: TABS, realtime: false }),
    );
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.include("CountOnlyAPI");
    expect(warnings[0]).to.include("/api/tab-count-warning/count-only");
    expect(warnings[0]).to.include("TableViewRoutes.CountBatch");
  });

  it("warns once per controller however many tables mount it", () => {
    const warnings = countBatchWarnings(() => {
      TableView(RepeatedAPI, { tabs: TABS, realtime: false });
      TableView(RepeatedAPI, { tabs: TABS, realtime: false });
    });
    expect(warnings).to.have.length(1);
  });

  it("stays silent when the controller mounts countBatch", () => {
    const warnings = countBatchWarnings(() =>
      TableView(BatchAPI, { tabs: TABS, realtime: false }),
    );
    expect(warnings).to.be.empty;
  });

  it("stays silent when countBatch is mounted under another key", () => {
    const warnings = countBatchWarnings(() =>
      TableView(RenamedBatchAPI, { tabs: TABS, realtime: false }),
    );
    expect(warnings).to.be.empty;
  });

  it("stays silent when the table declares no tabs", () => {
    const warnings = countBatchWarnings(() => {
      TableView(NoTabsAPI, { realtime: false });
      TableView(NoTabsAPI, { tabs: [], realtime: false });
    });
    expect(warnings).to.be.empty;
  });
});
