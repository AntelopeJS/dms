/** @vitest-environment jsdom */
import { nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import { PHONE_VIEWPORT_QUERY } from "../layers/dms-ui/app/entries/composables/table-view/useMobileDisplay";
import { pinnedStatus, DEFAULTS } from "./helpers/table-view-views-fixtures";
import { createTableViewViewsFixture } from "./helpers/table-view-views-harness";

describe("useTableViews", () => {
  const fixture = createTableViewViewsFixture();
  registerViewArrivalTests(fixture);
  registerViewDefaultsAndSavingTests(fixture);
  registerViewClosingTests(fixture);
  registerMobileAndDeclaredViewTests(fixture);
});

/** A media query that matches, or not, for good. */
class FixedMediaQuery extends EventTarget implements MediaQueryList {
  onchange = null;

  constructor(
    readonly media: string,
    readonly matches: boolean,
  ) {
    super();
  }

  addListener = () => undefined;
  removeListener = () => undefined;
}

function registerViewArrivalTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  it("opens the view the URL names, over the state kept from the last visit", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "mine" },
      preferences: { activeView: "all" },
    });
    expect(api.activeViewId.value).toBe("mine");
    expect(state.columnFilters.value).toEqual([
      { ...pinnedStatus },
      { accessorKey: "owner", mode: "is", value: "{{user.id}}", pinned: false },
    ]);
    expect(state.sorting.value).toEqual([{ id: "title", desc: false }]);
    expect(state.pagination.value.pageIndex).toBe(0);
    expect(api.items.value[1]?.label).toBe("i18n:tickets.mine");
  });

  it("falls back to the default view, with a word, for a view the caller cannot open", async () => {
    const { api } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { "content.view": "user-of-someone-else" },
    });
    expect(api.activeViewId.value).toBe("all");
    expect(fixture.toasts).toEqual([
      expect.objectContaining({ title: "dms.table.views.unavailable_title" }),
    ]);
  });

  it("opens a user view the URL names once its views are restored in the browser", async () => {
    const { api } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "user-mine" },
      preferences: {
        userViews: [
          { id: "user-mine", label: "Mine", ownerId: "u1", search: "x" },
        ],
      },
    });
    expect(api.activeViewId.value).toBe("user-mine");
    expect(fixture.toasts).toEqual([]);
  });

  it("restores the browser-only state, a view opened on arrival keeping its own", async () => {
    const opened = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "all" },
      preferences: { density: "compact" },
    });
    expect(opened.state.density.value).toBe("default");
    fixture.app?.unmount();

    const kept = await fixture.mountViews({
      views: fixture.VIEWS,
      preferences: { density: "compact", activeView: "" },
    });
    expect(kept.state.density.value).toBe("compact");
  });

  it("brings the kept view's search back with it", async () => {
    const { api, state } = await fixture.mountViews({
      views: {
        ...fixture.VIEWS,
        items: [
          ...fixture.VIEWS.items,
          { id: "printers", label: "P", search: "T-13" },
        ],
      },
      preferences: { activeView: "printers" },
    });
    expect(api.activeViewId.value).toBe("printers");
    expect(state.globalFilter.value).toBe("T-13");
  });

  it("brings a kept user view's search back once its views are restored", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      preferences: {
        activeView: "user-mine",
        userViews: [
          { id: "user-mine", label: "Mine", ownerId: "u1", search: "T-13" },
        ],
      },
    });
    expect(api.activeViewId.value).toBe("user-mine");
    expect(state.globalFilter.value).toBe("T-13");
  });
}

function registerViewDefaultsAndSavingTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  it("opens on the defaults, not the kept view, when a link names the table's state", async () => {
    const { api, preferences } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { tab: "closed" },
      preferences: { activeView: "mine" },
      isLinked: true,
    });
    expect(api.activeViewId.value).toBe("all");

    expect(preferences.get("activeView")).toBe("mine");
  });

  it("opens the default view on a first visit only", async () => {
    const first = await fixture.mountViews({ views: fixture.VIEWS });
    expect(first.api.activeViewId.value).toBe("all");
    fixture.app?.unmount();
    const later = await fixture.mountViews({
      views: fixture.VIEWS,
      preferences: { activeView: "" },
    });
    expect(later.api.activeViewId.value).toBe(undefined);
  });

  it("marks a view modified until it is reset", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "mine" },
    });
    expect(api.change.value).toBe("unchanged");
    state.globalFilter.value = "printer";
    await nextTick();
    expect(api.change.value).toBe("modified");
    state.sorting.value = [{ id: "createdAt", desc: true }];
    await nextTick();
    expect(api.change.value).toBe("modified");
    api.resetView();
    await nextTick();
    expect(state.globalFilter.value).toBe(undefined);
    expect(api.change.value).toBe("unchanged");
  });

  it("saves the current state as a view of the user's own, served to them only", async () => {
    const { api, state, preferences } = await fixture.mountViews({
      views: fixture.VIEWS,
      viewName: " Printers ",
      preferences: {
        userViews: [{ id: "user-x", label: "Theirs", ownerId: "u2" }],
      },
    });
    state.globalFilter.value = "printer";
    await api.saveAsNewView();
    await nextTick();
    const saved = api.activeView.value;
    expect(saved).toMatchObject({
      label: "Printers",
      isUserView: true,
      search: "printer",
    });
    expect(api.items.value.map((view) => view.label)).toEqual([
      "All",
      "i18n:tickets.mine",
      "Printers",
    ]);
    expect(preferences.get("userViews")).toHaveLength(2);

    state.density.value = "compact";
    await nextTick();
    expect(api.change.value).toBe("modified");
    api.saveView();
    await nextTick();
    expect(api.change.value).toBe("unchanged");

    await api.deleteView(saved!.id);
    await nextTick();
    expect(api.activeViewId.value).toBe(undefined);
    expect(api.items.value).toHaveLength(2);
  });
}

function registerViewClosingTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  it("closes the open view when it is clicked again, back to the table's defaults", async () => {
    const { api, state } = await fixture.mountViews({
      views: {
        ...fixture.VIEWS,
        defaultView: undefined,
        items: fixture.VIEWS.items.slice(1),
      },
      query: { view: "mine" },
    });
    expect(state.sorting.value).toEqual([{ id: "title", desc: false }]);
    api.selectView("mine");
    await nextTick();
    expect(api.activeViewId.value).toBe(undefined);
    expect(api.change.value).toBe("unchanged");
    expect(state.columnFilters.value).toEqual([{ ...pinnedStatus }]);
    expect(state.sorting.value).toEqual(DEFAULTS.sorting);
    api.selectView("mine");
    expect(api.activeViewId.value).toBe("mine");
  });

  it("opens no view on a link with an empty view key, over the default view", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "" },
      preferences: { activeView: "mine" },
      isLinked: true,
    });
    expect(api.activeViewId.value).toBe(undefined);
    expect(state.sorting.value).toEqual(DEFAULTS.sorting);

    api.openLinkedView({ view: "mine" });
    expect(api.activeViewId.value).toBe("mine");
    api.openLinkedView({ view: "" });
    expect(api.activeViewId.value).toBe(undefined);
    expect(state.columnFilters.value).toEqual([{ ...pinnedStatus }]);
  });

  it("asks before deleting a view, and leaves the deleted open view's state behind", async () => {
    const userViews = [
      { id: "user-printers", label: "Printers", ownerId: "u1", search: "T-13" },
    ];
    const declined = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "user-printers" },
      preferences: { userViews },
      isConfirmed: false,
    });
    await declined.api.deleteView("user-printers");
    expect(fixture.dialogs).toEqual([
      expect.objectContaining({ title: "dms.table.views.delete_title" }),
    ]);
    expect(declined.api.activeViewId.value).toBe("user-printers");
    expect(declined.state.globalFilter.value).toBe("T-13");
    fixture.app?.unmount();

    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "user-printers" },
      preferences: { userViews },
    });
    expect(state.globalFilter.value).toBe("T-13");
    await api.deleteView("user-printers");
    await nextTick();
    expect(api.items.value.map((view) => view.id)).toEqual(["all", "mine"]);
    expect(api.activeViewId.value).toBe(undefined);
    expect(state.globalFilter.value).toBe(undefined);
    expect(state.sorting.value).toEqual(DEFAULTS.sorting);
  });
}

function registerMobileAndDeclaredViewTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  describe("on a phone, with a mobileDisplay", () => {
    beforeEach(() => {
      window.matchMedia = (query: string) =>
        new FixedMediaQuery(query, query === PHONE_VIEWPORT_QUERY);
    });

    it("opens the default view on the phone's display when the view sets none", async () => {
      const { api, state } = await fixture.mountViews({
        views: fixture.VIEWS,
        mobileDisplay: "grouped",
      });
      expect(api.activeViewId.value).toBe("all");
      expect(state.display.value).toBe("grouped");
      expect(api.change.value).toBe("unchanged");
      api.openView("mine");
      await nextTick();
      expect(state.display.value).toBe("grouped");
    });

    it("keeps the display an open view fixes", async () => {
      const { state } = await fixture.mountViews({
        views: {
          ...fixture.VIEWS,
          items: [{ id: "all", label: "All", display: "table" }],
        },
        mobileDisplay: "grouped",
      });
      expect(state.display.value).toBe("table");
    });

    it("opens a view the URL names without a display on the phone's display", async () => {
      const { api, state } = await fixture.mountViews({
        views: fixture.VIEWS,
        query: { view: "mine" },
        mobileDisplay: "grouped",
      });
      expect(api.activeViewId.value).toBe("mine");
      expect(state.display.value).toBe("grouped");
    });
  });

  it("never saves over a view the module declares", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "mine" },
    });
    state.globalFilter.value = "printer";
    api.saveView();
    api.resetView();
    await nextTick();
    expect(state.globalFilter.value).toBe(undefined);
  });
}
