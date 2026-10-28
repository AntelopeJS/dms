import Module, { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import type * as TableViewInterface from "@antelopejs/interface-dms/base/table-view";
import type * as RealtimeInterface from "@antelopejs/interface-dms/realtime";
import type * as DmsRealtime from "../../../../realtime";
import type * as DmsRealtimeImplementation from "../../../../implementations/dms/realtime";
import type * as DmsTableViewImplementation from "../../../../implementations/dms-base/table-view";

type LoadModule = (
  this: ModuleLoader,
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
) => ReturnType<NodeRequire>;

interface ModuleLoader {
  _load: LoadModule;
}

export interface EvaluationOrderResult {
  published: string[];
  present: string[];
  pageTopics: string[];
}

const LOCATION = "/api/evaluation-order";
const PAGE_ID = "pages.evaluation-order";
const SESSION = "evaluation-order-session";
const ROW = "evaluation-order-row";

function enterThroughTableView(): typeof TableViewInterface {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Node's public Module declaration omits _load; this isolated child process deliberately intercepts that private loader to control evaluation order.
  const loader = Module as unknown as ModuleLoader;
  const load = loader._load;
  const manifest = findPackageJSON(
    "@antelopejs/interface-dms/base/table-view",
    __filename,
  );
  if (!manifest) throw new Error("Cannot locate table-view package");
  const tableViewEntry = join(dirname(manifest), "dist/base/table-view.js");
  let hasLoadedDms = false;
  loader._load = function (request, parent, isMain) {
    if (!hasLoadedDms && parent?.filename === tableViewEntry) {
      hasLoadedDms = true;
      require("../../../../realtime");
      require("../../../../realtime/table-view/index");
      require("../../../../implementations/dms/realtime");
    }
    return load.call(this, request, parent, isMain);
  };
  try {
    return require("@antelopejs/interface-dms/base/table-view");
  } finally {
    loader._load = load;
  }
}

async function run(): Promise<EvaluationOrderResult> {
  const tableView = enterThroughTableView();
  const realtimeInterface: typeof RealtimeInterface = require("@antelopejs/interface-dms/realtime");
  const realtime: typeof DmsRealtime = require("../../../../realtime");
  const rowTopic = tableView.tableViewRowTopic(LOCATION);

  realtimeInterface.RegisterPageTopic(PAGE_ID, rowTopic);

  ImplementInterface(
    realtimeInterface,
    require("../../../../implementations/dms/realtime") satisfies typeof DmsRealtimeImplementation,
  );
  ImplementInterface(
    tableView,
    require("../../../../implementations/dms-base/table-view") satisfies typeof DmsTableViewImplementation,
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
  (error) => {
    const report = error instanceof Error ? error.stack : String(error);
    process.stderr.write(`${report}\n`, () => process.exit(1));
  },
);
