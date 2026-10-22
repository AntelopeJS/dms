import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * A card moved on the kanban is saved by the board itself, outside the table
 * view's rows: the board tells the view, which reads its tab, group and
 * navigation counts again, as a save from the form does.
 */
const read = (file: string) =>
  readFileSync(
    resolve(__dirname, "../layers/dms-ui/app/components/table-view", file),
    "utf8",
  );

it("emits a saved move, and only a saved one", () => {
  const board = read("KanbanBoard.vue");
  expect(board).toMatch(/moved: \[item: T, column: KanbanColumnDef\];/);
  expect(board).toMatch(
    /await queued;\s*emit\("moved", item, target\);\s*toast\.add\(/,
  );
  const failure = board.slice(board.indexOf("notifyMoveError(error);"));
  expect(failure.slice(0, failure.indexOf("finally"))).not.toContain(
    'emit("moved"',
  );
});

it("hands the move to the table view, which reads its counts again", () => {
  expect(read("KanbanDisplay.vue")).toContain(
    '@moved="bridge?.onCardMoved?.()"',
  );
  const tableView = read("TableView.vue");
  expect(tableView).toMatch(/onCardMoved: \(\) => void refreshCounts\(\),/);
  expect(tableView).toMatch(
    /const refreshCounts = async \(\) => \{\s*notifyTableDataChanged\(location\);\s*await Promise\.all\(\[\s*refreshTabCounts\(\),\s*refreshLinkTabCounts\(\),\s*refreshGroupCounts\(\),/,
  );
});

it("reads the counts again on a realtime update, self-managed display or not", () => {
  const tableView = read("TableView.vue");
  const handler = tableView.slice(
    tableView.indexOf("[REALTIME_EVENT_TYPE.UPDATED]: async"),
  );
  const body = handler.slice(0, handler.indexOf("\n  },"));
  expect(body.match(/refreshCounts\(\)/g)).toHaveLength(2);
});
