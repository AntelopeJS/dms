import { Controller, Get, Post } from "@antelopejs/interface-api";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";

export const QUICK_ACTIONS_DEMO_API = "/api/playground/quick-actions";

interface QuickActionRow {
  _id: string;
  name: string;
  target: string;
  effect: string;
}

const ROWS: QuickActionRow[] = [
  {
    _id: "open-tabs",
    name: "Open the tabs table",
    target: "navigate",
    effect: "Routes to the page",
  },
  {
    _id: "open-invoicer",
    name: "Open project invoicer",
    target: "navigate + query",
    effect: "Routes to /dynamic-nav/project?project=invoicer",
  },
  {
    _id: "new-task",
    name: "New task",
    target: "openForm",
    effect: "Routes to the tabs table and opens its creation form",
  },
  {
    _id: "new-invoice",
    name: "New invoice (survives the gate)",
    target: "openForm + component",
    effect: "Names one of the two table views of its page",
  },
  {
    _id: "new-nested-task",
    name: "New nested task",
    target: "openForm + targetChild",
    effect: "Opens a table view nested in a stack",
  },
  {
    _id: "press-button",
    name: "Press this page's header button",
    target: "button",
    effect: 'Presses the table\'s "Log a press" button, wherever you are',
  },
  {
    _id: "ping",
    name: "Dispatch a demo event",
    target: "event",
    effect: "A window event a playground plugin answers with a toast",
  },
];

interface RowsResponse {
  results: QuickActionRow[];
  total: number;
}

interface PressResponse {
  pressed: boolean;
}

export class QuickActionsDemoController extends Controller(
  QUICK_ACTIONS_DEMO_API,
) {
  @Get("")
  list(@AuthUser() _user: User): RowsResponse {
    return { results: ROWS, total: ROWS.length };
  }

  @Post("press")
  press(@AuthUser() _user: User): PressResponse {
    return { pressed: true };
  }
}
