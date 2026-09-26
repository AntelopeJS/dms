// Run as a plain Node process by table-view-evaluation-order.test.ts: only a
// fresh module graph lets a test choose what evaluates first.
//
// A consumer enters the interface package through the table-view subpath, and
// the DMS's realtime modules evaluate before that subpath has finished: its
// exports are still empty. The DMS used to install a table-view bridge from
// those modules, which is why the install had been deferred to `start()`.
// Nothing there may reach into table-view any more: implementing the interface
// in `construct()` is all the table view needs to reach the DMS.
import Module from "node:module";
import { ImplementInterface } from "@antelopejs/interface-core";
import type * as TableViewInterface from "@antelopejs/interface-dms/base/table-view";
import type * as RealtimeInterface from "@antelopejs/interface-dms/realtime";
import type * as DmsRealtime from "../../../../realtime";
import type * as DmsRealtimeImplementation from "../../../../implementations/dms/realtime";
import type * as DmsTableViewImplementation from "../../../../implementations/dms-base/table-view";

type LoadModule = (
  this: unknown,
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
) => unknown;

interface ModuleLoader {
  _load: LoadModule;
}

export interface EvaluationOrderResult {
  published: string[];
  present: string[];
  pageTopics: string[];
}

const TABLE_VIEW = "@antelopejs/interface-dms/base/table-view";
const REALTIME = "@antelopejs/interface-dms/realtime";
const LOCATION = "/api/evaluation-order";
const PAGE_ID = "pages.evaluation-order";
const SESSION = "evaluation-order-session";
const ROW = "evaluation-order-row";
const DMS_REALTIME = "../../../../realtime";
const DMS_REALTIME_IMPLEMENTATION = "../../../../implementations/dms/realtime";
const DMS_TABLE_VIEW_IMPLEMENTATION =
  "../../../../implementations/dms-base/table-view";
const DMS_REALTIME_MODULES = [
  DMS_REALTIME,
  "../../../../realtime/table-view",
  DMS_REALTIME_IMPLEMENTATION,
];

function enterThroughTableView(): typeof TableViewInterface {
  const loader = Module as unknown as ModuleLoader;
  const load = loader._load;
  const tableViewEntry = require.resolve(TABLE_VIEW);
  let hasLoadedDms = false;
  loader._load = function (request, parent, isMain) {
    if (!hasLoadedDms && parent?.filename === tableViewEntry) {
      hasLoadedDms = true;
      for (const path of DMS_REALTIME_MODULES) require(path);
    }
    return load.call(this, request, parent, isMain);
  };
  try {
    return require(TABLE_VIEW) as typeof TableViewInterface;
  } finally {
    loader._load = load;
  }
}

async function run(): Promise<EvaluationOrderResult> {
  const tableView = enterThroughTableView();
  const realtimeInterface = require(REALTIME) as typeof RealtimeInterface;
  const realtime = require(DMS_REALTIME) as typeof DmsRealtime;
  const rowTopic = tableView.tableViewRowTopic(LOCATION);

  // A page registers its topics before the DMS implements the interface.
  realtimeInterface.RegisterPageTopic(PAGE_ID, rowTopic);

  // What the DMS's `construct()` does, once every module has evaluated.
  ImplementInterface(
    realtimeInterface,
    require(DMS_REALTIME_IMPLEMENTATION) as typeof DmsRealtimeImplementation,
  );
  ImplementInterface(
    tableView,
    require(DMS_TABLE_VIEW_IMPLEMENTATION) as typeof DmsTableViewImplementation,
  );

  const published: string[] = [];
  realtime.subscribeRealtime(rowTopic, (event) => published.push(event.type));
  const actor = { id: "evaluation-order-user" };
  await tableView.internal.PublishMutation({
    controllerLocation: LOCATION,
    rowIdKey: "_id",
    eventType: "updated",
    ids: [ROW],
    actor,
  });
  await tableView.internal.AcquirePresence({
    controllerLocation: LOCATION,
    rowIdKey: "_id",
    sessionId: SESSION,
    rowId: ROW,
    actor,
  });
  const present = await realtime
    .getPresenceTracker()
    .snapshotForTopic(tableView.tableViewPresenceTopic(LOCATION));
  return {
    published,
    present: present.map((entry) => entry.rowId),
    pageTopics: [...realtime.getPageTopics(PAGE_ID)],
  };
}

run().then(
  (result) => {
    process.stdout.write(JSON.stringify(result), () => process.exit(0));
  },
  (error: unknown) => {
    const report = error instanceof Error ? error.stack : String(error);
    process.stderr.write(`${report}\n`, () => process.exit(1));
  },
);
