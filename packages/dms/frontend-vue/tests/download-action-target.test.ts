/** @vitest-environment jsdom */
/**
 * A `download` action target fetches its file with the user's session and
 * saves it: its URL and file name take the page's `{{params.X}}` /
 * `{{query.X}}` and the row's `{field}`, and a refusal is toasted.
 */
import { createApp, defineComponent, h, reactive, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import type { CustomButton } from "../layers/dms-ui/app/composables/table-view/types/custom-button";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

const route = reactive<{ path: string; query: Record<string, string> }>({
  path: "/modules/lang/queue/de",
  query: {},
});
const fetchRaw = vi.fn();
const handleApiError = vi.fn();
const saved: string[] = [];
let app: App | undefined;

function mountTargets() {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          api: vi.fn(),
          pageId: "queue-page",
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

const downloadButton = (filename?: string): CustomButton => ({
  id: "download-language",
  label: "Download",
  target: {
    type: "download",
    url: "/api/lang/translations/export?workspace={{query.workspace}}&locale={{query.locale}}",
    filename,
  },
});

const served = (disposition?: string) =>
  fetchRaw.mockResolvedValue({
    _data: new Blob(["{}"]),
    headers: new Headers(
      disposition ? { "content-disposition": disposition } : {},
    ),
  });

beforeEach(() => {
  route.query = { workspace: "web", locale: "pt BR" };
  fetchRaw.mockReset();
  handleApiError.mockReset();
  saved.length = 0;
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
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: Object.assign(vi.fn(), { raw: fetchRaw }),
  }));
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useSiteLayout", () => ({
    findMatchingRoute: () => ({ params: { locale: "de" } }),
  }));
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:file"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a download action target", () => {
  it("fetches the page's file with the session, under the declared name", async () => {
    served('attachment; filename="served.json"');
    mountTargets().handleCustomButton(downloadButton("{{query.locale}}.json"));
    await vi.waitFor(() => expect(saved).toEqual(["pt BR.json"]));
    expect(fetchRaw).toHaveBeenCalledWith(
      "/api/lang/translations/export?workspace=web&locale=pt%20BR",
      { responseType: "blob" },
    );
  });

  it("leaves out a query pair the page has no value for", async () => {
    route.query = { locale: "fr" };
    served();
    mountTargets().handleCustomButton(downloadButton());
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(fetchRaw).toHaveBeenCalledWith(
      "/api/lang/translations/export?locale=fr",
      { responseType: "blob" },
    );
  });

  it("is saved under the server's name, else the URL's, without one declared", async () => {
    served('attachment; filename="fr.json"');
    mountTargets().handleCustomButton(downloadButton());
    await vi.waitFor(() => expect(saved).toEqual(["fr.json"]));

    served();
    mountTargets().handleCustomButton(downloadButton());
    await vi.waitFor(() => expect(saved).toEqual(["fr.json", "export"]));
  });

  it("falls back to the server's name while a name token has no value", async () => {
    route.query = { workspace: "web" };
    served('attachment; filename="web.json"');
    mountTargets().handleCustomButton(downloadButton("{{query.locale}}.json"));
    await vi.waitFor(() => expect(saved).toEqual(["web.json"]));
  });

  it("fills a row action's URL and name with the row's fields", async () => {
    served();
    const action: CustomRowAction = {
      label: "Download",
      target: {
        type: "download",
        url: "/api/files/{{row._id}}?workspace={{query.workspace}}",
        filename: "{{row.name}}",
      },
    };
    mountTargets().handleCustomRowAction(action, {
      _id: "f 1",
      name: "report.csv",
    });
    await vi.waitFor(() => expect(saved).toEqual(["report.csv"]));
    expect(fetchRaw).toHaveBeenCalledWith("/api/files/f%201?workspace=web", {
      responseType: "blob",
    });
  });

  it("toasts a refused download under the button's label", async () => {
    const refusal = new Error("Forbidden");
    fetchRaw.mockRejectedValue(refusal);
    mountTargets().handleCustomButton(downloadButton());
    await vi.waitFor(() =>
      expect(handleApiError).toHaveBeenCalledWith(refusal, "Download"),
    );
    expect(saved).toEqual([]);
  });
});
