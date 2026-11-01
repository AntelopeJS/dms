/** @vitest-environment jsdom */
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  closeRowSidePanel,
  ROW_SIDE_PANEL_ID,
  useRowSidePanelContent,
} from "../layers/dms-ui/app/entries/composables/layout/rowSidePanel";
import {
  isDeepLinkAction,
  resolveDeepLinkedRow,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/recordLink";
import {
  type Row,
  openPanelId,
  rows,
  panelAction,
  mountPanel,
  settle,
  query,
  title,
  position,
  shownName,
  press,
} from "./row-side-panel-runtime";

describe("row side panel deep link", () => {
  it("keeps the open row in the URL, following the steps", async () => {
    const { targets } = mountPanel();
    const action = panelAction({ deepLink: true });
    expect(isDeepLinkAction(action)).toBe(true);
    targets.handleCustomRowAction(action, rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    press("j");
    await settle();
    expect(window.location.search).toBe("?record=r2");
    closeRowSidePanel();
    expect(window.location.search).toBe("");
  });

  it("keeps the row in the URL by default, deepLink: false opting out", async () => {
    expect(isDeepLinkAction(panelAction())).toBe(true);
    expect(isDeepLinkAction(panelAction({ deepLink: false }))).toBe(false);
    expect(isDeepLinkAction(panelAction({}, { deepLink: false }))).toBe(false);
    expect(
      isDeepLinkAction(panelAction({ deepLink: false }, { deepLink: true })),
    ).toBe(true);
    const drawer = panelAction({ type: "drawer" });
    expect(isDeepLinkAction(drawer)).toBe(false);

    const { targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    closeRowSidePanel();
    targets.handleCustomRowAction(panelAction({ deepLink: false }), rows[0]);
    await settle();
    expect(window.location.search).toBe("");
  });

  it("leaves the next page's ?record= alone when it closes on the way out", async () => {
    const { targets, showTable } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    window.history.pushState(null, "", "/runs?record=run-5");
    showTable.value = false;
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.pathname).toBe("/runs");
    expect(window.location.search).toBe("?record=run-5");
  });

  it("leaves a ?record= another row wrote on the same page alone", async () => {
    const { targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    window.history.replaceState(null, "", "/requests?record=other");
    closeRowSidePanel();
    expect(window.location.search).toBe("?record=other");
  });
});

describe("deep link to a row the table does not list", () => {
  const older: Row = { _id: "r9", name: "Older" };
  const idOf = (row: Row) => row._id;

  it("reads a row beyond the first page by id", async () => {
    const getRow = vi.fn(async () => older);
    expect(
      await resolveDeepLinkedRow("r9", { listed: rows, idOf, getRow }),
    ).toEqual({ row: older, isMissing: false });
    expect(getRow).toHaveBeenCalledWith("r9");
  });

  it("takes a listed row as it is, without a request", async () => {
    const getRow = vi.fn(async () => older);
    const found = await resolveDeepLinkedRow("r2", {
      listed: rows,
      idOf,
      getRow,
    });
    expect(found.row).toBe(rows[1]);
    expect(getRow).not.toHaveBeenCalled();
  });

  it("marks a row its route answers 404 for as missing", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("Not Found"), { statusCode: 404 });
    });
    expect(
      await resolveDeepLinkedRow("gone", {
        listed: rows,
        idOf,
        getRow: missing,
      }),
    ).toEqual({ isMissing: true });
  });

  it("marks a refused read as failed and finds nothing without a row route", async () => {
    const error = Object.assign(new Error("Forbidden"), { status: 403 });
    const refused = async () => {
      throw error;
    };
    expect(
      await resolveDeepLinkedRow("r9", { listed: rows, idOf, getRow: refused }),
    ).toEqual({ isMissing: false, isFailed: true, error });
    const noRoute = async () => undefined;
    expect(
      await resolveDeepLinkedRow("r9", { listed: rows, idOf, getRow: noRoute }),
    ).toEqual({ row: undefined, isMissing: false });
  });

  it("opens the unlisted row without a position, J and K inert", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ deepLink: true }), older);
    await settle();
    expect(shownName(host)).toBe("Older");
    expect(position(host)).toBeUndefined();
    expect(query(host, "[data-dms-row-side-panel-next]")).toBeNull();
    expect(window.location.search).toBe("?record=r9");
    press("j");
    await settle();
    expect(shownName(host)).toBe("Older");
  });
});

describe("showing another row from the panel", () => {
  const older: Row = { _id: "r9", name: "Older" };
  const notFoundError = () =>
    Object.assign(new Error("Not Found"), { statusCode: 404 });
  const showRow = (rowOrId: Row | string) => {
    // SAFETY: mountPanel opens useActionTargets' row container, which installs the async row-or-id showRow prop.
    const show = useRowSidePanelContent().value!.componentOptions.showRow as (
      rowOrId: Row | string,
    ) => Promise<void>;
    return show(rowOrId);
  };

  it("moves the highlight, the position and ?record= onto a listed row", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await showRow("r3");
    await settle();
    expect(shownName(host)).toBe("Third");
    expect(position(host)).toBe("side_panel.position(3/3)");
    expect(useRowSidePanelContent().value?.rowKey).toBe("r3");
    expect(window.location.search).toBe("?record=r3");
    await showRow(rows[1]!);
    await settle();
    expect(position(host)).toBe("side_panel.position(2/3)");
  });

  it("reads an unlisted row by id, shown without a position", async () => {
    const getRow = vi.fn(async () => older);
    const { host, targets } = mountPanel(ref(rows), getRow);
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await showRow("r9");
    await settle();
    expect(getRow).toHaveBeenCalledWith("r9");
    expect(shownName(host)).toBe("Older");
    expect(position(host)).toBeUndefined();
    expect(useRowSidePanelContent().value?.rowKey).toBe("r9");
    expect(window.location.search).toBe("?record=r9");
  });

  it("says a row its route answers 404 for is gone", async () => {
    const { host, targets } = mountPanel(ref(rows), async () => {
      throw notFoundError();
    });
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await showRow("gone");
    await settle();
    expect(query(host, "[data-dms-row-side-panel-not-found]")).not.toBeNull();
    expect(useRowSidePanelContent().value?.rowKey).toBeUndefined();
    expect(window.location.search).toBe("?record=gone");
  });

  it("rejects a row it cannot read, keeping the row it shows", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await expect(showRow("r9")).rejects.toThrow("r9");
    await settle();
    expect(shownName(host)).toBe("First");
    expect(window.location.search).toBe("?record=r1");
  });

  it("leaves the panel shut when it closed while the row was read", async () => {
    let answer!: (row: Row) => void;
    const { host, targets } = mountPanel(
      ref(rows),
      () => new Promise((resolve) => (answer = resolve)),
    );
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const shown = showRow("r9");
    closeRowSidePanel();
    answer(older);
    await shown;
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(window.location.search).toBe("");
  });
});

describe("side panel on a missing row", () => {
  const notFound = (host: ParentNode) =>
    query(host, "[data-dms-row-side-panel-not-found]");

  it("says the row is gone under the target's title, with the DMS's words", async () => {
    window.history.replaceState(null, "", "/requests?record=gone");
    const { host, targets } = mountPanel();
    targets.handleMissingRow(panelAction(), "gone");
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
    expect(title(host)).toBe("Request details");
    expect(position(host)).toBeUndefined();
    expect(shownName(host)).toBeUndefined();
    expect(notFound(host)?.textContent).toContain(
      "$side_panel.not_found.title",
    );
    expect(notFound(host)?.textContent).toContain(
      "$side_panel.not_found.description",
    );
  });

  it("takes the target's own not-found words", async () => {
    const { host, targets } = mountPanel();
    targets.handleMissingRow(
      panelAction({
        notFound: {
          title: "$api.request.not_found_title",
          description: "$api.request.not_found_description",
        },
      }),
      "gone",
    );
    await settle();
    expect(notFound(host)?.textContent).toContain(
      "$api.request.not_found_title",
    );
    expect(notFound(host)?.textContent).toContain(
      "$api.request.not_found_description",
    );
  });

  it("closes from its state, removing the link's ?record=", async () => {
    window.history.replaceState(null, "", "/requests?record=gone");
    const { host, targets } = mountPanel();
    targets.handleMissingRow(panelAction(), "gone");
    await settle();
    notFound(host)?.querySelector("button")?.click();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("opens nothing for a drawer action", async () => {
    const { host, targets } = mountPanel();
    targets.handleMissingRow(panelAction({ type: "drawer" }), "gone");
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
  });
});
