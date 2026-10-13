import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { serializeConfirmDialog } from "@antelopejs/interface-dms/base/confirm-dialog";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { type DemoRecord, JSON_TYPE, parseFormBody } from "../demo-record-api";
import { FORM_CONFIRM_API, PageFormConfirm, WORKSPACE_NAME } from "./page";

const HTTP_CONFLICT = 409;
const ARCHIVED_TABLES = 42;
const ACTIVE_STATUS = "Active";
const ARCHIVED_STATUS = "Archived";
const MEMBERS = ["ada@acme.io", "bruno@acme.io", "ines@acme.io"];

interface TransferBody {
  email?: string;
  reason?: string;
  notify?: boolean;
}

function defaultWorkspace(): DemoRecord {
  return { name: WORKSPACE_NAME, owner: MEMBERS[0], status: ACTIVE_STATUS };
}

/** The workspace the header buttons act on, kept in memory. */
const workspace: DemoRecord = defaultWorkspace();

function refuseNonMember(email: string | undefined): void {
  if (email && MEMBERS.includes(email.toLowerCase())) return;
  throw new HTTPResult(
    HTTP_CONFLICT,
    JSON.stringify({
      field: "email",
      message: "Not a member of this workspace.",
    }),
    JSON_TYPE,
  );
}

/**
 * The routes behind the "Confirmations" demo: the workspace record, what the
 * header buttons run, and the dialogs the server words for `confirm: { from
 * }` and `useConfirmFrom`.
 */
export class FormConfirmAPIController extends Controller(FORM_CONFIRM_API) {
  @AuthUserWithPermission(PageFormConfirm)
  declare user: User;

  @Get("get")
  get() {
    return workspace;
  }

  @Put("save")
  async save(@JSONBody() body: DemoRecord) {
    Object.assign(
      workspace,
      await parseFormBody(PageFormConfirm.workspace, body),
    );
    return workspace;
  }

  @Get("backup")
  backup() {
    return { workspace, members: MEMBERS };
  }

  @Post("delete")
  remove() {
    Object.assign(workspace, defaultWorkspace());
    return { message: "Reset" };
  }

  @Post("transfer")
  transfer(@JSONBody() body: TransferBody) {
    refuseNonMember(body.email);
    workspace.owner = body.email;
    return { message: "Transferred" };
  }

  @Get("archive-dialog")
  archiveDialog() {
    return serializeConfirmDialog({
      title: "Archive {workspace}?",
      description: "{count} tables become read-only.",
      params: { workspace: workspace.name, count: ARCHIVED_TABLES },
      color: "warning",
      icon: "i-ph-archive",
      confirmLabel: "Archive",
    });
  }

  @Post("archive")
  archive() {
    workspace.status = ARCHIVED_STATUS;
    return { message: "Archived" };
  }

  @Post("leave")
  leave() {
    return { message: "Left" };
  }

  @Get("dialog/:id")
  dialog(@Parameter("id", "param") id: string) {
    return serializeConfirmDialog({
      title: "Remove {name}?",
      description:
        "The {id} record and its history are deleted. Type {id} in any case.",
      params: { id },
      confirmText: id.toUpperCase(),
      confirmTextCaseInsensitive: true,
      secondaryAction: {
        label: "Download {name}.json",
        icon: "i-ph-download-simple",
        target: {
          type: "download",
          url: `${FORM_CONFIRM_API}/backup`,
          filename: "{name}.json",
        },
      },
    });
  }
}
