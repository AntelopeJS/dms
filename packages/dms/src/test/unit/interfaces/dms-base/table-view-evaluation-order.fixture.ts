import Module, { findPackageJSON } from "node:module";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ImplementInterface } from "@antelopejs/interface-core";

export interface EvaluationOrderResult {
  published: string[];
  present: string[];
  pageTopics: string[];
}

const LOCATION = "/api/evaluation-order";
const PAGE_ID = "pages.evaluation-order";
const SESSION = "evaluation-order-session";
const ROW = "evaluation-order-row";

async function enterThroughTableView() {
  const manifest = findPackageJSON(
    "@antelopejs/interface-dms/base/table-view",
    __filename,
  );
  if (!manifest) throw new Error("Cannot locate table-view package");
  const tableViewEntry = pathToFileURL(
    realpathSync(join(dirname(manifest), "dist/base/table-view.js")),
  ).href;
  let hasLoadedDms = false;
  const hooks = Module.registerHooks({
    resolve: (specifier, context, nextResolve) => {
      if (!hasLoadedDms && context.parentURL === tableViewEntry) {
        hasLoadedDms = true;
        require("../../../../realtime");
        require("../../../../realtime/table-view/index");
        require("../../../../implementations/dms/realtime");
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    const entered = await import("@antelopejs/interface-dms/base/table-view");
    if (!hasLoadedDms)
      throw new Error(`The load of ${tableViewEntry} was never intercepted`);
    return entered;
  } finally {
    hooks.deregister();
  }
}

async function run(): Promise<EvaluationOrderResult> {
  const tableView = await enterThroughTableView();
  const realtimeInterface = await import("@antelopejs/interface-dms/realtime");
  const realtime = await import("../../../../realtime");
  const rowTopic = tableView.tableViewRowTopic(LOCATION);

  realtimeInterface.RegisterPageTopic(PAGE_ID, rowTopic);

  ImplementInterface(
    realtimeInterface,
    await import("../../../../implementations/dms/realtime"),
  );
  ImplementInterface(
    tableView,
    await import("../../../../implementations/dms-base/table-view"),
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
