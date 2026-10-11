import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import { Color } from "../layers/dms-core/app/types/color";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { normalizeActionConfig } from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { useTranslation } from "../layers/dms-core/app/composables/translation/useTranslation";
import { useEventedAction } from "../layers/dms-core/app/composables/useEventedAction";
import {
  ConfirmActionError,
  type ConfirmOptions,
} from "../layers/dms-ui/app/composables/confirm/types";
import core from "../layers/dms-core/i18n/locales/core-en-GB.json";
import ui from "../layers/dms-ui/i18n/locales/ui-en-GB.json";

// The form the row actions open is not under test.
vi.mock("../layers/dms-ui/app/components/form/Form.vue", () => ({
  default: {},
}));

type Messages = Record<string, unknown>;
const merge = (target: Messages, source: Messages): Messages => {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    target[key] =
      current && typeof current === "object" && typeof value === "object"
        ? merge({ ...(current as Messages) }, value as Messages)
        : value;
  }
  return target;
};

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: merge(merge({}, core), ui) as never },
});
const t = i18n.global.t as (...args: unknown[]) => string;

const toast = { add: vi.fn() };
const refresh = vi.fn();
const api = vi.fn();
// The dialog as ConfirmModal runs it: the action goes inside with the values
// of its fields, a rejection keeps it open (here: the user then gives up), a
// partial outcome is acknowledged.
const dialogs: {
  options: ConfirmOptions;
  outcome?: unknown;
  error?: unknown;
}[] = [];
let dialogValues: Record<string, unknown> = {};
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

function fetchError(status: number | undefined, data?: unknown) {
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

async function rowActions() {
  const { useTableRowActions } = await import(
    "../layers/dms-ui/app/build/composables/table-view/useTableViewRowActions"
  );
  return useTableRowActions({
    api: api as never,
    location: "/api/task",
    componentId: "table",
    pageId: "tasks",
    formComponents: {},
    refreshCallback: refresh,
    rowNavigation: { rows: () => shownRows, rowIdKey: "_id" },
  });
}

beforeEach(() => {
  const globals: Record<string, unknown> = {
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
  toast.add.mockReset();
  refresh.mockReset();
  api.mockReset();
  confirm.mockClear();
  dialogs.length = 0;
  dialogValues = {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Table row actions: refusals", () => {
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
          url: "/api/invites/{_id}/resend",
          successMessage: "Sent",
        },
        confirm: { title: "Resend?", description: "" },
      } as never,
      { _id: "i1" },
    );
    await vi.waitFor(() => expect(dialogs).toHaveLength(1));
    await vi.waitFor(() => expect(dialogs[0]!.error).toBeDefined());

    expect(api).toHaveBeenCalledWith("/api/invites/i1/resend", {
      method: HttpMethod.post,
    });
    // The dialog shows it: no toast on top.
    expect((dialogs[0]!.error as { statusCode: number }).statusCode).toBe(404);
    expect(toast.add).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("toasts the refusal of an action without a dialog, in the error colour", async () => {
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
          url: "/api/invites/{_id}/link",
          successMessage: "Copied",
          copy: "url",
        },
      } as never,
      { _id: "i1" },
    );
    await vi.waitFor(() => expect(toast.add).toHaveBeenCalled());

    expect(confirm).not.toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalledWith({
      color: Color.error,
      icon: "i-ph-warning-circle",
      title: "Copy link",
      description: "You don’t have permission to do this.",
    });
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

  it("keeps the dialog open when the rules refused every row", async () => {
    api.mockResolvedValue({ deleted: 0 });
    const { deleteRows } = await rowActions();

    const done = await deleteRows(["1", "2"], true);

    expect(done).toBe(false);
    const error = dialogs[0]!.error as ConfirmActionError;
    expect(error).toBeInstanceOf(ConfirmActionError);
    expect(error.message).toBe("These 2 items couldn’t be deleted.");
    expect(toast.add).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves a failed bulk request to the dialog", async () => {
    api.mockRejectedValue(fetchError(undefined));
    const { archiveRows } = await rowActions();

    expect(await archiveRows(["1"], true)).toBe(false);
    expect((dialogs[0]!.error as Error).name).toBe("FetchError");
    expect(toast.add).not.toHaveBeenCalled();
  });

  it("toasts a restore (no dialog) that failed or went only part of the way", async () => {
    const { restoreRows } = await rowActions();

    api.mockRejectedValueOnce(fetchError(undefined));
    expect(await restoreRows(["1", "2"], true)).toBe(false);
    expect(toast.add).toHaveBeenLastCalledWith({
      color: Color.error,
      icon: "i-ph-warning-circle",
      title: "Failed to restore items",
      description:
        "The server could not be reached. Check your connection and try again.",
    });

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
          url: "/api/users/{_id}/ban",
          body: { notify: true, scope: "all" },
          successMessage: "Banned",
        },
        confirm: { title: "Ban {name}?", fields: [] },
      } as never,
      { _id: "u1", name: "Ada" },
    );
    await vi.waitFor(() => expect(api).toHaveBeenCalled());

    expect(dialogs[0]!.options.title).toBe("Ban Ada?");
    expect(api).toHaveBeenCalledWith("/api/users/u1/ban", {
      method: HttpMethod.post,
      body: { notify: false, scope: "all", reason: "spam" },
    });
  });

  it("asks the dialog a `from` URL words for one row, before a delete", async () => {
    api.mockImplementation(async (url: string) =>
      url === "/api/task/t1/delete-confirm"
        ? { title: "$dms.table.delete_rows", params: { count: 1 } }
        : 1,
    );
    const { deleteRows } = await rowActions();

    const done = await deleteRows(["t1"], {
      confirm: { from: "/api/task/{id}/delete-confirm" },
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
      confirm: { from: "/api/task/{id}/delete-confirm" },
    });

    expect(api).not.toHaveBeenCalledWith("/api/task/t1/delete-confirm");
    expect(dialogs[0]!.options.title).toBe("Delete 2 items?");
  });

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
});
