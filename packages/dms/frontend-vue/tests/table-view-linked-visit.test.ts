/** @vitest-environment jsdom */
/**
 * A link clicked to the page a table is already shown on is followed even
 * when it names the tab open: Inertia pushes it as a client visit (turned
 * into a replace, without `navigate`, when the URL does not change), while
 * a page control rebuilding the query replaces it and is no link.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, describe, expect, it } from "vitest";

interface VisitDetail {
  page: { url: string };
  visitId: string;
  replace?: boolean;
}
const { useTableLinkedVisit } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableLinkedVisit"
);

const emit = (type: string, detail: VisitDetail) =>
  document.dispatchEvent(new CustomEvent(`inertia:${type}`, { detail }));

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

function mountTable(url: string, shown: { view?: string; tab: string }) {
  const followed: Array<Record<string, unknown>> = [];
  const app = createApp(
    defineComponent({
      setup() {
        useTableLinkedVisit({
          route: {
            path: new URL(url, "http://x").pathname,
            query: Object.fromEntries(new URL(url, "http://x").searchParams),
          },
          urlScope: { tableId: "content", isSoleTableView: true },
          queryParamFilters: undefined,
          activeView: () => shown.view,
          activeTab: () => shown.tab,
          canOpenView: () => true,
          canOpenTab: () => true,
          follow: (query) => followed.push(query),
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  mounted.push(app);
  return followed;
}

describe("useTableLinkedVisit", () => {
  const shown = { view: "due-week", tab: "overdue" };

  it("follows a link clicked to the URL shown, which Inertia does not navigate", () => {
    const followed = mountTable("/invoices?tab=overdue", shown);
    emit("clientVisit", {
      page: { url: "/invoices?tab=overdue" },
      visitId: "v1",
      replace: false,
    });
    expect(followed).toEqual([{ tab: "overdue" }]);
  });

  it("follows a link clicked to the tab open under another spelling, once", () => {
    const followed = mountTable("/invoices?tab=overdue", shown);
    const detail = { page: { url: "/invoices?content.tab=overdue" } };
    emit("navigate", { ...detail, visitId: "v1" });
    emit("clientVisit", { ...detail, visitId: "v1", replace: false });
    expect(followed).toEqual([{ "content.tab": "overdue" }]);
  });

  it("leaves a page control replacing the query in place", () => {
    const followed = mountTable("/invoices?tab=overdue&customer=c1", shown);
    emit("clientVisit", {
      page: { url: "/invoices?tab=overdue" },
      visitId: "v1",
      replace: true,
    });
    expect(followed).toEqual([]);
  });

  it("leaves Back to the tab open, and a link to another page", () => {
    const followed = mountTable("/invoices?tab=overdue", shown);
    emit("navigate", { page: { url: "/invoices?tab=overdue" }, visitId: "v1" });
    emit("clientVisit", {
      page: { url: "/payments?tab=overdue" },
      visitId: "v2",
      replace: false,
    });
    expect(followed).toEqual([]);
  });
});
