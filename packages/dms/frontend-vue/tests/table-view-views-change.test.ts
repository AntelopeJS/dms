/** @vitest-environment jsdom */
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { resetColumnFilters } from "../layers/dms-ui/app/entries/composables/table/utils/clearTableFilters";
import { createTableViewViewsFixture } from "./helpers/table-view-views-harness";

describe("useTableViews, once the table moves off the open view", () => {
  const fixture = createTableViewViewsFixture();

  it("leaves a view whose filters were cleared, as Helio's Awaiting signature under Draft", async () => {
    const { api, state } = await fixture.mountViews({
      views: {
        items: [
          {
            id: "awaiting",
            label: "Awaiting signature",
            filters: [{ accessorKey: "status", mode: "is", value: "sent" }],
          },
        ],
      },
      query: { view: "awaiting" },
    });
    state.columnFilters.value = resetColumnFilters(state.columnFilters.value);
    await nextTick();
    expect(api.change.value).toBe("diverged");
    expect(api.activeViewId.value).toBe("awaiting");
    api.resetView();
    await nextTick();
    expect(api.change.value).toBe("unchanged");
    state.columnFilters.value = resetColumnFilters(state.columnFilters.value);
    api.selectView("awaiting");
    await nextTick();
    expect(api.activeViewId.value).toBe("awaiting");
    expect(api.change.value).toBe("unchanged");
  });

  it("leaves a view whose filter or search was changed, not one narrowed further", async () => {
    const { api, state } = await fixture.mountViews({
      views: {
        items: [
          {
            id: "late",
            label: "Late",
            search: "invoice",
            filters: [{ accessorKey: "owner", mode: "is", value: "u1" }],
          },
        ],
      },
      query: { view: "late" },
    });
    const opened = state.columnFilters.value;
    state.columnFilters.value = [
      ...opened,
      { accessorKey: "email", mode: "contains", value: "@acme" },
    ];
    await nextTick();
    expect(api.change.value).toBe("modified");
    state.columnFilters.value = opened.map((filter) =>
      filter.accessorKey === "owner" ? { ...filter, value: "u2" } : filter,
    );
    await nextTick();
    expect(api.change.value).toBe("diverged");
    state.columnFilters.value = opened;
    state.globalFilter.value = "receipt";
    await nextTick();
    expect(api.change.value).toBe("diverged");
    state.globalFilter.value = "invoice";
    state.columnFilters.value = opened.map((filter) =>
      filter.pinned ? { ...filter, value: "closed" } : filter,
    );
    await nextTick();
    expect(api.change.value).toBe("diverged");
  });

  it("opens a view saved with a pinned filter cleared on that state", async () => {
    const { api, state } = await fixture.mountViews({
      views: { userViews: true, items: [{ id: "all", label: "All" }] },
      query: { view: "all" },
    });
    state.columnFilters.value = state.columnFilters.value.map((filter) =>
      filter.pinned ? { ...filter, value: undefined } : filter,
    );
    await nextTick();
    expect(api.change.value).toBe("diverged");
    await api.saveAsNewView();
    await nextTick();
    expect(api.activeView.value?.label).toBe("Mine");
    expect(api.change.value).toBe("unchanged");
  });
});
