import {
  Context,
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import type { ConfirmDialogSerialized } from "@antelopejs/interface-dms/base/table-view";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";

const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const JSON_TYPE = "application/json";
const SHARE_BASE_URL = "https://share.example.com/tasks";
const PRIORITIES = ["low", "medium", "high"] as const;

interface PriorityBody {
  priority?: string;
}

interface TaskShare {
  url: string;
}

function refuse(status: number, message: string): HTTPResult {
  return new HTTPResult(status, JSON.stringify({ message }), JSON_TYPE);
}

/**
 * The tasks of the "Custom Row Actions" demo, with the routes its actions
 * and buttons call: each one really changes the row, so the table shows what
 * the action did.
 */
@RegisterDataController()
export class customRowActionsTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/custom-row-actions", taskDataAPI),
) {
  private async findTask(id: string) {
    const task = await this.model.get(id);
    if (!task) throw refuse(HTTP_NOT_FOUND, "Task not found");
    return task;
  }

  /** The "Complete all pending" button: every pending task, at once. */
  @Post("complete-all")
  async completeAll(): Promise<{ count: number }> {
    const pending = await this.model.getBy("status", "pending");
    await Promise.all(
      pending.map((task) =>
        this.model.update(task._id, { status: "completed", done: true }),
      ),
    );
    return { count: pending.length };
  }

  @Post("complete")
  async complete(@Parameter("id", "query") id: string) {
    await this.model.update(id, { status: "completed", done: true });
    return { ok: true };
  }

  @Post("cancel")
  async cancel(@Parameter("id", "query") id: string) {
    await this.model.update(id, { status: "cancelled" });
    return { ok: true };
  }

  /** Answers a link the "Copy share link" action copies (`copy: "url"`). */
  @Post("share")
  share(@Parameter("id", "query") id: string): TaskShare {
    return { url: `${SHARE_BASE_URL}/${encodeURIComponent(id)}` };
  }

  /** The file the "Download JSON" action saves. */
  @Get("export")
  async exportTask(@Parameter("id", "query") id: string) {
    return this.findTask(id);
  }

  /** The bulk "Set priority" drawer: the selected ids and the picked value. */
  @Post("set-priority")
  async setPriority(
    @Context() ctx: RequestContext,
    @JSONBody() body: PriorityBody,
  ): Promise<{ count: number }> {
    const candidate = body?.priority ?? "";
    const priority = PRIORITIES.find((value) => value === candidate);
    if (!priority) {
      throw refuse(HTTP_BAD_REQUEST, "Unknown priority");
    }
    const ids = ctx.url.searchParams.getAll("ids");
    await Promise.all(ids.map((id) => this.model.update(id, { priority })));
    return { count: ids.length };
  }

  /**
   * The delete confirmation, worded by the server for the row
   * (`delete.confirm.from`): a completed task cannot go.
   */
  @Get("removal-confirm")
  async removalConfirm(
    @Parameter("id", "query") id: string,
  ): Promise<ConfirmDialogSerialized> {
    const task = await this.findTask(id);
    if (task.status === "completed") {
      return {
        title: "This task cannot be deleted",
        description:
          "A completed task stays for the record: archive it instead.",
        icon: "i-ph-lock",
        blocked: true,
      };
    }
    return {
      title: "Delete {name}?",
      description: `It is ${task.status.replace("_", " ")}; its assignees lose it.`,
      icon: "i-ph-trash",
      color: "error",
      confirmLabel: "Delete",
    };
  }
}
