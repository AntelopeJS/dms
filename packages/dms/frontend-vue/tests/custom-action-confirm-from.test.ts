// @vitest-environment jsdom
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

const authFetch = vi.fn(async () => ({ title: "Refund?" }));
const navigateDms = vi.fn();
let app: App | undefined;

function mountTargets(rowIdKey?: string) {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          api: vi.fn() as never,
          pageId: "orders-page",
          componentId: "orders",
          handleApiError: vi.fn(),
          rowIdKey,
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return targets!;
}

const REFUND: CustomRowAction = {
  label: "Refund",
  target: { type: "page", url: "/orders" },
  confirm: { from: "/api/orders/{id}/refund-confirm?customer={customer}" },
};

beforeEach(() => {
  authFetch.mockClear();
  navigateDms.mockClear();
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
    processApiMessage: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
  vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
  vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("navigateDms", navigateDms);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("a custom row action's confirmation worded by the server", () => {
  it("fills {id} with the row's id, like a built-in action, besides its fields", async () => {
    mountTargets().handleCustomRowAction(REFUND, {
      _id: "o1",
      customer: "Ada",
    });
    await vi.waitFor(() => expect(navigateDms).toHaveBeenCalledTimes(1));
    expect(authFetch).toHaveBeenCalledWith(
      "/api/orders/o1/refund-confirm?customer=Ada",
    );
  });

  it("reads the id through the table's rowIdKey", async () => {
    mountTargets("uuid").handleCustomRowAction(REFUND, {
      _id: "ignored",
      uuid: "o2",
      customer: "Grace",
    });
    await vi.waitFor(() => expect(navigateDms).toHaveBeenCalledTimes(1));
    expect(authFetch).toHaveBeenCalledWith(
      "/api/orders/o2/refund-confirm?customer=Grace",
    );
  });
});
