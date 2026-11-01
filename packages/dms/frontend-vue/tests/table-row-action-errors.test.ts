import "./helpers/table-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchClientMock } from "./fixtures/unusedApi";
import {
  readOnlyFailure,
  installReadOnlyRefusal,
} from "./helpers/read-only-refusal";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import { Color } from "../layers/dms-core/app/types/color";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { normalizeActionConfig } from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import { useTranslation } from "../layers/dms-core/app/composables/translation/useTranslation";
import { useEventedAction } from "../layers/dms-core/app/composables/useEventedAction";
import {
  ConfirmActionError,
  type ConfirmOptions,
  type ConfirmValues,
} from "../layers/dms-ui/app/composables/confirm/types";
import core from "../layers/dms-core/app/entries/i18n/locales/core-en-GB.json";
import ui from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";

type Messages = { [key: string]: string | Messages };
const merge = (target: Messages, source: Messages): Messages => {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    target[key] =
      isObject(current) && isObject(value)
        ? merge({ ...current }, value)
        : value;
  }
  return target;
};

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: merge(merge({}, core), ui) },
});
const t = i18n.global.t;

const toast = { add: vi.fn(() => ({ id: "failure" })) };
const refresh = vi.fn();
const api = fetchClientMock();

const dialogs: {
  options: ConfirmOptions;
  outcome?: unknown;
  error?: unknown;
}[] = [];
let dialogValues: ConfirmValues = {};
const confirm = vi.fn(async (options: ConfirmOptions) => {
  const dialog: (typeof dialogs)[number] = { options };
  dialogs.push(dialog);
  if (!options.onConfirm) return true;
  try {
    dialog.outcome = await options.onConfirm({ ...dialogValues });
    return dialog.outcome !== false;
  } catch (error) {
    dialog.error = error;
    return false;
  }
});

function fetchError(status: number | undefined, data?: string) {
  return Object.assign(new Error(`[PUT] "/api/task": ${status}`), {
    name: "FetchError",
    statusCode: status,
    data,
  });
}

const shownRows = [
  { _id: "t1", name: "Write the report" },
  { _id: "t2", name: "Review the draft" },
];

const getRow = vi.fn();

async function rowActions() {
  const { useTableRowActions } =
    await import("../layers/dms-ui/app/entries/composables/table-view/useTableViewRowActions");
  return useTableRowActions({
    api,
    location: "/api/task",
    columns: [],
    componentId: "table",
    pageId: "tasks",
    formComponents: {},
    refreshCallback: refresh,
    rowNavigation: { rows: () => shownRows, rowIdKey: "_id", getRow },
  });
}

beforeEach(() => {
  vi.stubEnv("SSR", false);
  const globals = {
    ref,
    Color,
    HttpMethod,
    normalizeActionConfig,
    interpolateUrl,
    useTranslation,
    useEventedAction,
    useI18n: () => ({ t }),
    useToast: () => toast,
    useConfirm: () => ({ confirm }),
    useAuthFetch: () => ({ $authFetch: api }),
    useModal: () => ({ open: vi.fn() }),
    useDrawer: () => ({ open: vi.fn() }),
    useDmsRoute: () => ({ query: {} }),
    useExportJob: () => ({ runJob: vi.fn() }),
    useComponentEvent: () => ({ sendComponentEvent: vi.fn() }),
    navigateDms: vi.fn(),
    resolveDmsComponent: vi.fn(),
  };
  for (const [name, value] of Object.entries(globals)) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("getPluginI18n", () => ({ i18n: i18n.global }));
  toast.add.mockClear();
  refresh.mockReset();
  api.mockReset();
  getRow.mockReset();
  confirm.mockClear();
  dialogs.length = 0;
  dialogValues = {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Table row actions: refusals", () => {
  registerRowActionRefusalTests();
  registerBulkActionRefusalTests();
  registerRowActionDialogTests();
  registerRowActionConfirmationTests();
});

function registerRowActionRefusalTests() {
  it("returns false for a direct marked restore, keeping rows and selection rather than refreshing", async () => {
    installReadOnlyRefusal();
    api.mockRejectedValue(readOnlyFailure());
    const actions = await rowActions();
    const selected = ["t1"];
    expect(await actions.restoreRows(selected, true)).toBe(false);
    expect(selected).toEqual(["t1"]);
    expect(shownRows.map(({ _id }) => _id)).toEqual(["t1", "t2"]);
    expect(refresh).not.toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "error.read_only_demo",
        color: "warning",
      }),
    );
  });

  it("runs a confirmed action inside its dialog, which shows the refusal", async () => {
    api.mockRejectedValue(
      fetchError(404, "$page.settings.invites.error.not_found"),
    );
    const { handleCustomRowAction } = await rowActions();
    handleCustomRowAction(
      {
        label: "Resend",
        target: {
          type: "api",
          url: "/api/invites/{{row._id}}/resend",
          successMessage: "Sent",
        },
        confirm: { title: "Resend?", description: "" },
      },
      { _id: "i1" },
    );
    await vi.waitFor(() => expect(dialogs).toHaveLength(1));
    await vi.waitFor(() => expect(dialogs[0]!.error).toBeDefined());

    expect(api).toHaveBeenCalledWith("/api/invites/i1/resend", {
      method: HttpMethod.post,
    });

    expect(dialogs[0]!.error).toHaveProperty("statusCode", 404);
    expect(toast.add).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("toasts a plain refusal with its contextual fallback and warning tone", async () => {
    api.mockRejectedValue(
      fetchError(403, "Forbidden: missing permission settings.invites"),
    );
    const { handleCustomRowAction } = await rowActions();
    handleCustomRowAction(
      {
        label: "Copy link",
        target: {
          type: "api",
          method: "GET",
          url: "/api/invites/{{row._id}}/link",
          successMessage: "Copied",
          copy: "url",
        },
      },
      { _id: "i1" },
    );
    await vi.waitFor(() => expect(toast.add).toHaveBeenCalled());

    expect(confirm).not.toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.warning,
        title:
          "Something went wrong and the action couldn’t be completed. Try again.",
        description: undefined,
      }),
    );
  });

  it("sums up a bulk action some rows refused, applying the rest", async () => {
    api.mockResolvedValue({ success: true, archivedCount: 3 });
    const { archiveRows } = await rowActions();

    const done = await archiveRows(["1", "2", "3", "4", "5"], true);

    expect(done).toBe(true);
    expect(dialogs[0]!.outcome).toEqual({
      partial: {
        title: "2 of 5 items couldn’t be archived.",
        description:
          "Their rules don’t allow this action, or it was already done.",
      },
    });
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.success,
        title: "3 items archived",
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
}

function registerBulkActionRefusalTests() {
  it("keeps the dialog open when the rules refused every row", async () => {
    api.mockResolvedValue({ deleted: 0 });
    const { deleteRows } = await rowActions();

    const done = await deleteRows(["1", "2"], true);

    expect(done).toBe(false);
    const error = dialogs[0]!.error;
    expect(error).toBeInstanceOf(ConfirmActionError);
    expect(error).toHaveProperty("message", "dms.table.bulk_refused.delete");
    expect(toast.add).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves a failed bulk request to the dialog", async () => {
    api.mockRejectedValue(fetchError(undefined));
    const { archiveRows } = await rowActions();

    expect(await archiveRows(["1"], true)).toBe(false);
    expect(dialogs[0]!.error).toHaveProperty("name", "FetchError");
    expect(toast.add).not.toHaveBeenCalled();
  });

  it("toasts a restore (no dialog) that failed or went only part of the way", async () => {
    const { restoreRows } = await rowActions();

    api.mockRejectedValueOnce(fetchError(undefined));
    expect(await restoreRows(["1", "2"], true)).toBe(false);
    expect(toast.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        color: Color.error,
        title: "Failed to restore items",
        description: undefined,
      }),
    );

    api.mockResolvedValueOnce({ success: true, restoredCount: 1 });
    expect(await restoreRows(["1", "2"], true)).toBe(true);
    expect(toast.add).toHaveBeenLastCalledWith({
      color: Color.warning,
      title: "1 item restored",
      description:
        "1 of 2 items couldn’t be restored. Its rules don’t allow this action, or it was already done.",
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("sends the values of the dialog's fields with the request, merged into its body", async () => {
    api.mockResolvedValue({});
    dialogValues = { reason: "spam", notify: false };
    const { handleCustomRowAction } = await rowActions();
    handleCustomRowAction(
      {
        label: "Ban",
        target: {
          type: "api",
          url: "/api/users/{{row._id}}/ban",
          body: { notify: true, scope: "all" },
          successMessage: "Banned",
        },
        confirm: { title: "Ban {name}?", fields: [] },
      },
      { _id: "u1", name: "Ada" },
    );
    await vi.waitFor(() => expect(api).toHaveBeenCalled());

    expect(dialogs[0]!.options.title).toBe("Ban Ada?");
    expect(api).toHaveBeenCalledWith("/api/users/u1/ban", {
      method: HttpMethod.post,
      body: { notify: false, scope: "all", reason: "spam" },
    });
  });
}

function registerRowActionDialogTests() {
  it("asks the dialog a `from` URL words for one row, before a delete", async () => {
    api.mockImplementation(async (url: string) =>
      url === "/api/task/t1/delete-confirm"
        ? { title: "$dms.table.delete_rows", params: { count: 1 } }
        : 1,
    );
    const { deleteRows } = await rowActions();

    const done = await deleteRows(["t1"], {
      confirm: { from: "/api/task/{{row.id}}/delete-confirm" },
    });

    expect(done).toBe(true);
    expect(dialogs[0]!.options.title).toBe("1 item deleted");
    expect(api).toHaveBeenLastCalledWith("/api/task/delete", {
      method: HttpMethod.delete,
      query: { id: ["t1"] },
    });
  });

  it("words a fixed dialog with the fields of the one row it deletes", async () => {
    api.mockResolvedValue(1);
    const { deleteRows } = await rowActions();

    await deleteRows(["t1"], { confirm: { title: "Delete {name}?" } });

    expect(dialogs[0]!.options.title).toBe("Delete Write the report?");
  });

  it("words a fixed dialog with the row its caller hands (a kanban card)", async () => {
    api.mockResolvedValue(1);
    const { deleteRows } = await rowActions();

    await deleteRows(
      ["t9"],
      { confirm: { title: "Delete {name}?" } },
      { rows: [{ _id: "t9", name: "Plan the launch" }] },
    );

    expect(dialogs[0]!.options.title).toBe("Delete Plan the launch?");
    expect(getRow).not.toHaveBeenCalled();
  });

  it("reads by id the one row a fixed dialog words, when the table does not show it", async () => {
    api.mockResolvedValue(1);
    getRow.mockResolvedValue({ _id: "t9", name: "Plan the launch" });
    const { deleteRows } = await rowActions();

    await deleteRows(["t9"], { confirm: { title: "Delete {name}?" } });

    expect(getRow).toHaveBeenCalledWith("t9");
    expect(dialogs[0]!.options.title).toBe("Delete Plan the launch?");
  });

  it("asks a fixed dialog anyway when the row cannot be read", async () => {
    api.mockResolvedValue(1);
    getRow.mockRejectedValue(fetchError(404));
    const { deleteRows } = await rowActions();

    const done = await deleteRows(["t9"], {
      confirm: { title: "Delete {count} task?" },
    });

    expect(done).toBe(true);
    expect(dialogs[0]!.options.title).toBe("Delete 1 task?");
  });

  it("words a fixed dialog with the count of the rows it deletes", async () => {
    api.mockResolvedValue(2);
    const { deleteRows } = await rowActions();

    await deleteRows(["t1", "t2"], {
      confirm: { title: "Delete {count} tasks?" },
    });

    expect(dialogs[0]!.options.title).toBe("Delete 2 tasks?");
  });

  it("keeps the generic confirmation for several rows of a `from` dialog", async () => {
    api.mockResolvedValue(2);
    const { deleteRows } = await rowActions();

    await deleteRows(["t1", "t2"], {
      confirm: { from: "/api/task/{{row.id}}/delete-confirm" },
    });

    expect(api).not.toHaveBeenCalledWith("/api/task/t1/delete-confirm");
    expect(dialogs[0]!.options.title).toBe("Delete 2 items?");
  });
}

function registerRowActionConfirmationTests() {
  it("hands a `from` URL naming no row the whole selection, and the delete its answer", async () => {
    api.mockImplementation(async (url: string) =>
      url.startsWith("/api/roles/delete-confirm")
        ? { title: "Delete {count} roles?", params: { count: 2 } }
        : 2,
    );
    dialogValues = { reassignTo: "r3" };
    const { deleteRows } = await rowActions();

    const done = await deleteRows(["r1", "r2"], {
      confirm: { from: "/api/roles/delete-confirm" },
    });
    dialogValues = {};

    expect(done).toBe(true);
    expect(api).toHaveBeenCalledWith("/api/roles/delete-confirm?ids=r1&ids=r2");
    expect(dialogs[0]!.options.title).toBe("Delete 2 roles?");
    expect(api).toHaveBeenLastCalledWith("/api/task/delete", {
      method: HttpMethod.delete,
      query: { id: ["r1", "r2"] },
      body: { reassignTo: "r3" },
    });
  });

  it("asks a built-in action's confirmation before running it", async () => {
    const proceed = vi.fn();
    const { runConfirmedBuiltIn } = await rowActions();

    await runConfirmedBuiltIn(
      { confirm: { title: "Edit {name}?" } },
      { _id: "t1", name: "Docs" },
      proceed,
    );
    expect(dialogs[0]!.options.title).toBe("Edit Docs?");
    expect(proceed).toHaveBeenCalledOnce();

    confirm.mockResolvedValueOnce(false);
    await runConfirmedBuiltIn(
      { confirm: { title: "Again?" } },
      undefined,
      proceed,
    );
    expect(proceed).toHaveBeenCalledOnce();

    await runConfirmedBuiltIn(true, undefined, proceed);
    expect(proceed).toHaveBeenCalledTimes(2);
  });
}
