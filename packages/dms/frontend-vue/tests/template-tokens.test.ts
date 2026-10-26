/** @vitest-environment jsdom */
/**
 * Every option naming a value with a token writes it `{{<scope>.<key>}}`, and
 * every URL or link option fills the page's `{{params.X}}` / `{{query.X}}`
 * the same way: an `api` or `exportJob` target as a `page` one, a
 * confirmation's `from`, a block's links, a form's `backTo`.
 */
import { createApp, defineComponent, h, reactive, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import {
  interpolateRowText,
  interpolateUrl,
} from "../layers/dms-core/app/utils/url-interpolation";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import {
  replaceUrlVariables,
  resolveLinkVariables,
} from "../layers/dms-ui/app/build/utils/urlVariables";
import {
  pageLink,
  pageRequestUrl,
} from "../layers/dms-ui/app/build/composables/page/pageUrlValues";
import { buttonLinkProps } from "../layers/dms-ui/app/build/utils/link";
import { resolveConfirmDialog } from "../layers/dms-ui/app/build/composables/confirm/confirmDialogTexts";
import type { CustomButton } from "../layers/dms-ui/app/composables/table-view/types/custom-button";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

const route = reactive<{ path: string; query: Record<string, string> }>({
  path: "/modules/shop/stores/s1",
  query: {},
});
const api = vi.fn();
const runJob = vi.fn();
let app: App | undefined;

function mountTargets() {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          // SAFETY: These target cases invoke only the callable API mock, never $fetch's raw/create/native members.
          api: api as Parameters<typeof useActionTargets>[0]["api"],
          pageId: "store-page",
          componentId: "orders",
          handleApiError: vi.fn(),
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return targets!;
}

beforeEach(() => {
  route.query = { store: "north", period: "7d" };
  api.mockReset().mockResolvedValue(undefined);
  runJob.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
    processApiMessage: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
  vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
  vi.stubGlobal("useExportJob", () => ({ runJob }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: Object.assign(vi.fn(), { raw: vi.fn() }),
  }));
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useSiteLayout", () => ({
    findMatchingRoute: () => ({ params: { id: "s1" } }),
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("token syntax", () => {
  const context = {
    routeParams: { id: "s 1" },
    routeQuery: { store: "north" },
    response: { data: { id: "o-9" } },
  };

  it("allows spaces inside the braces, as the server's filter tokens do", () => {
    expect(
      replaceUrlVariables(
        "/s/{{ params.id }}?store={{  query.store }}",
        context,
      ),
    ).toBe("/s/s%201?store=north");
  });

  it("reaches into a response with a dotted path", () => {
    expect(replaceUrlVariables("/orders/{{response.data.id}}", context)).toBe(
      "/orders/o-9",
    );
  });

  it("resolves a redirect's response and page tokens, dropping an empty pair", () => {
    expect(
      resolveLinkVariables(
        "/orders/{{response.data.id}}?store={{query.store}}&tab={{query.tab}}",
        context,
      ),
    ).toBe("/orders/o-9?store=north");
  });

  it("names a row field with {{row.X}}, a dotted path reaching into it", () => {
    const row = { _id: "a 1", customer: { name: "Ada" } };
    expect(interpolateUrl("/o/{{row._id}}/{{ row.customer.name }}", row)).toBe(
      "/o/a%201/Ada",
    );
    expect(interpolateRowText("{{row._id}}.csv", row)).toBe("a 1.csv");
  });

  it("does not take a single-brace name for a row field", () => {
    expect(interpolateUrl("/o/{_id}", { _id: "a" })).toBe("/o/{_id}");
  });

  it("leaves another scope's token whole when filling a row", () => {
    expect(interpolateUrl("/s/{{params.id}}/o/{{row._id}}", { _id: "a" })).toBe(
      "/s/{{params.id}}/o/a",
    );
  });
});

describe("page tokens in links and requested routes", () => {
  it("fills a block link, leaving out a pair the page has no value for", () => {
    expect(pageLink("/stores/{{params.id}}?store={{query.store}}")).toBe(
      "/stores/s1?store=north",
    );
    expect(pageLink("/orders?tab={{query.tab}}")).toBe("/orders");
    expect(buttonLinkProps("/stores/{{params.id}}/orders")).toEqual({
      to: "/stores/s1/orders",
    });
  });

  it("does not request a route while one of its tokens has no value", () => {
    expect(pageRequestUrl("/api/stores/{{params.id}}/rotate")).toBe(
      "/api/stores/s1/rotate",
    );
    expect(pageRequestUrl("/api/x?tab={{query.tab}}")).toBeUndefined();
  });

  it("fills a confirmation's secondary target with the page, then the row", async () => {
    const runTarget = vi.fn();
    const dialog = resolveConfirmDialog(
      {
        title: "Remove",
        secondaryAction: {
          label: "Download",
          target: {
            type: "download",
            url: "/api/stores/{{params.id}}/orders/{{row._id}}",
            filename: "{{query.store}}-{{row.name}}.json",
          },
        },
      },
      { _id: "o1", name: "order" },
      (key) => key,
      runTarget,
    );
    await dialog.secondaryAction!.run();
    expect(runTarget).toHaveBeenCalledWith({
      type: "download",
      url: "/api/stores/s1/orders/o1",
      filename: "north-order.json",
    });
  });
});

describe("an action target's URL", () => {
  it("fills an api target on a row with the page's values, then the row's", async () => {
    const action: CustomRowAction = {
      label: "Refund",
      target: {
        type: "api",
        url: "/api/stores/{{params.id}}/orders/{{row._id}}/refund?store={{query.store}}",
        successMessage: "Refunded",
      },
    };
    mountTargets().handleCustomRowAction(action, { _id: "o 1" });
    await vi.waitFor(() => expect(api).toHaveBeenCalled());
    expect(api.mock.calls[0]![0]).toBe(
      "/api/stores/s1/orders/o%201/refund?store=north",
    );
  });

  it("fills an api target on a toolbar button, without a row", async () => {
    const button: CustomButton = {
      id: "sync",
      label: "Sync",
      target: {
        type: "api",
        url: "/api/stores/{{params.id}}/sync?period={{query.period}}",
        successMessage: "Synced",
      },
    };
    mountTargets().handleCustomButton(button);
    await vi.waitFor(() => expect(api).toHaveBeenCalled());
    expect(api.mock.calls[0]![0]).toBe("/api/stores/s1/sync?period=7d");
  });

  it("fills an export job's start, status and download URLs", async () => {
    const button: CustomButton = {
      id: "export",
      label: "Export",
      target: {
        type: "exportJob",
        url: "/api/stores/{{params.id}}/export?store={{query.store}}",
        statusUrl: "/api/stores/{{params.id}}/export/{{job.id}}",
        downloadUrl: "/api/stores/{{params.id}}/export/{{ job.id }}/file",
      },
    };
    mountTargets().handleCustomButton(button);
    await vi.waitFor(() => expect(runJob).toHaveBeenCalled());
    const job = runJob.mock.calls[0]![0];
    expect(job.startUrl).toBe("/api/stores/s1/export?store=north");
    expect(job.statusUrl({ jobId: "j1" })).toBe("/api/stores/s1/export/j1");
    expect(job.downloadUrl({ jobId: "j1" })).toBe(
      "/api/stores/s1/export/j1/file",
    );
  });
});
