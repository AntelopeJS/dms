/** @vitest-environment jsdom */
/**
 * An `api` action target's `redirect` opens a page of the dashboard once its
 * request succeeded, filled with the response's `{{response.<field>}}`, the
 * page's and the row's tokens, and never opens a URL a field it names is
 * missing from.
 */
import { createApp, defineComponent, h, reactive, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/entries/composables/actions/useActionTargets";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { fetchClient } from "./fixtures/fetchClient";
import type { CustomButton } from "../layers/dms-ui/app/composables/table-view/types/custom-button";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import type { ConfirmOptions } from "../layers/dms-ui/app/composables/confirm/types";

const route = reactive<{ path: string; query: Record<string, string> }>({
  path: "/sales/quotes/q1",
  query: {},
});
const navigateDms = vi.fn();
const toastAdd = vi.fn();
const handleApiError = vi.fn();
let answer: Data;
let app: App | undefined;

function mountTargets() {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          api: fetchClient(() => answer),
          pageId: "quote-page",
          componentId: "page-header",
          handleApiError,
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return targets!;
}

const createButton = (redirect: string): CustomButton => ({
  id: "create-document",
  label: "Create",
  target: {
    type: "api",
    url: "/api/quotes/{{params.id}}/copy",
    method: "POST",
    redirect,
    successMessage: "Created",
  },
});

beforeEach(() => {
  answer = { _id: "d1" };
  route.query = { tab: "lines" };
  navigateDms.mockReset();
  toastAdd.mockReset();
  handleApiError.mockReset();
  vi.stubGlobal("navigateDms", navigateDms);
  vi.stubGlobal("Color", { success: "success" });
  vi.stubGlobal("HttpMethod", { post: "POST" });
  vi.stubGlobal("useToast", () => ({ add: toastAdd }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
    processApiMessage: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
  vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
  vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
  vi.stubGlobal("useConfirm", () => ({
    confirm: async (options: ConfirmOptions) => {
      await options.onConfirm?.({});
      return true;
    },
  }));
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: Object.assign(vi.fn(), { raw: vi.fn() }),
  }));
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useSiteLayout", () => ({
    findMatchingRoute: () => ({ params: { id: "q1" } }),
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("an api target's redirect", () => {
  it("opens the page its response names, after the success toast", async () => {
    mountTargets().handleCustomButton(
      createButton("/sales/invoices/{{response._id}}?from={{params.id}}"),
    );
    await vi.waitFor(() =>
      expect(navigateDms).toHaveBeenCalledWith("/sales/invoices/d1?from=q1"),
    );
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Created" }),
    );
    expect(toastAdd.mock.invocationCallOrder[0]).toBeLessThan(
      navigateDms.mock.invocationCallOrder[0]!,
    );
  });

  it("reads a nested field of the response by its dotted path", async () => {
    answer = { document: { number: 42 } };
    mountTargets().handleCustomButton(
      createButton("/documents/{{response.document.number}}"),
    );
    await vi.waitFor(() =>
      expect(navigateDms).toHaveBeenCalledWith("/documents/42"),
    );
  });

  it("writes a response value as a form's redirectOnSuccess does", async () => {
    answer = { path: "invoices/7" };
    mountTargets().handleCustomButton(createButton("/sales/{{response.path}}"));
    await vi.waitFor(() =>
      expect(navigateDms).toHaveBeenCalledWith("/sales/invoices/7"),
    );
  });

  it("stays on the page with a warning when the response lacks the field", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    answer = { id: "d1" };
    mountTargets().handleCustomButton(
      createButton("/sales/invoices/{{response._id}}"),
    );
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled());
    expect(navigateDms).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("{{response._id}}"),
    );
  });

  it("fills a confirmed row action's redirect with the row and the response", async () => {
    const action: CustomRowAction = {
      label: "Duplicate",
      confirm: { title: "Duplicate?" },
      target: {
        type: "api",
        url: "/api/quotes/{{row._id}}/duplicate",
        redirect: "/sales/quotes/{{response._id}}?copyOf={{row.number}}",
        successMessage: "Duplicated",
      },
    };
    mountTargets().handleCustomRowAction(action, { _id: "q1", number: "Q-7" });
    await vi.waitFor(() =>
      expect(navigateDms).toHaveBeenCalledWith("/sales/quotes/d1?copyOf=Q-7"),
    );
  });
});
