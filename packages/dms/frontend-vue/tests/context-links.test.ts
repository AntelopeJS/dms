/** @vitest-environment jsdom */
/**
 * A link followed from a page keeps its context: a TopList row's `to` and a
 * link row action fill the page URL's `{{params.X}}` / `{{query.X}}` tokens,
 * a dotted period key included, and `withPeriodQuery` carries a selector's
 * period onto a link a module builds itself.
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  ref,
  type App,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import { useActionTargets } from "../layers/dms-ui/app/entries/composables/actions/useActionTargets";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { resolveLinkVariables } from "../layers/dms-ui/app/entries/utils/urlVariables";
import {
  periodQueryKeys,
  withPeriodQuery,
} from "../layers/dms-core/app/composables/period/periodLink";

const PAGE_QUERY = {
  website: "site-1",
  "mk.period": "last-7-days",
  "mk.compare": "previous-period",
};

const navigateDms = vi.fn();
let app: App | undefined;

beforeEach(() => {
  navigateDms.mockClear();
  vi.stubGlobal("useDmsRoute", () => ({
    path: "/modules/marketing/overview",
    query: PAGE_QUERY,
  }));
  vi.stubGlobal("useSiteLayout", () => ({
    findMatchingRoute: () => ({ params: { id: "o1" } }),
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("resolveLinkVariables", () => {
  it("leaves out a pair whose dotted query key the page does not hold", () => {
    expect(
      resolveLinkVariables(
        "/p?mk.period={{query.mk.period}}&mk.from={{query.mk.from}}",
        { routeQuery: PAGE_QUERY },
      ),
    ).toBe("/p?mk.period=last-7-days");
  });
});

describe("withPeriodQuery", () => {
  it("names the keys of a selector in the page URL", () => {
    expect(periodQueryKeys("mk").compareFrom).toBe("mk.compareFrom");
  });

  it("carries the selector's period, the link's own keys winning", () => {
    expect(
      withPeriodQuery(
        "/modules/marketing/funnel?id=f1&mk.compare=none#steps",
        PAGE_QUERY,
        "mk",
      ),
    ).toBe(
      "/modules/marketing/funnel?id=f1&mk.compare=none&mk.period=last-7-days#steps",
    );
  });

  it("leaves a link bare when the page carries no period", () => {
    expect(withPeriodQuery("/modules/marketing/funnels", {}, "mk")).toBe(
      "/modules/marketing/funnels",
    );
  });

  it("ignores another selector's keys", () => {
    expect(withPeriodQuery("/p", { "sales.period": "ytd" }, "mk")).toBe("/p");
  });
});

const Link = defineComponent({
  props: { to: { type: String, required: true } },
  setup: (props) => () => h("a", { "data-row": "", href: props.to }),
});

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function renderTopList(): Promise<string> {
  const ssrApp = createSSRApp({
    render: () =>
      h(TopListCard, {
        title: "Top pages",
        componentId: "pages",
        pageId: "overview",
        staticItems: [
          {
            id: "pricing",
            title: "/pricing",
            value: 12,
            to: "/modules/marketing/pages?path=%2Fpricing&website={{query.website}}&mk.period={{query.mk.period}}&mk.from={{query.mk.from}}",
          },
          { id: "plain", title: "/", value: 3, to: "/modules/marketing/pages" },
        ],
      }),
  });
  for (const name of ["DmsCard", "UBadge", "UIcon", "USkeleton", "UButton"]) {
    ssrApp.component(name, Slot);
  }
  ssrApp.component("DmsLink", Link);
  return renderToString(ssrApp);
}

describe("a TopList row link", () => {
  beforeEach(() => {
    vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text,
    }));
    vi.stubGlobal("useComponentEvent", () => ({}));
    vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
  });

  it("fills the page's tokens and drops a pair the page has no value for", async () => {
    const html = await renderTopList();
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
      match[1]!.replaceAll("&amp;", "&"),
    );
    expect(hrefs).toEqual([
      "/modules/marketing/pages?path=%2Fpricing&website=site-1&mk.period=last-7-days",
      "/modules/marketing/pages",
    ]);
  });
});

function mountTargets() {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Page-link tests never call the HTTP client; the callable mock intentionally omits fetch methods.
          api: vi.fn() as never,
          pageId: "orders-page",
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

describe("a link row action", () => {
  beforeEach(() => {
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
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
    vi.stubGlobal("interpolateUrl", interpolateUrl);
    vi.stubGlobal("navigateDms", navigateDms);
  });

  it("fills the page's tokens, then the row's fields", async () => {
    mountTargets().handleCustomRowAction(
      {
        label: "Report",
        target: {
          type: "page",
          url: "/modules/marketing/funnel?id={{row._id}}&website={{query.website}}&mk.period={{query.mk.period}}&mk.to={{query.mk.to}}&order={{params.id}}",
        },
      },
      { _id: "f 1" },
    );
    await vi.waitFor(() => expect(navigateDms).toHaveBeenCalledTimes(1));
    expect(navigateDms).toHaveBeenCalledWith(
      "/modules/marketing/funnel?id=f%201&website=site-1&mk.period=last-7-days&order=o1",
    );
  });

  it("leaves a URL without page tokens as before", async () => {
    mountTargets().handleCustomRowAction(
      { label: "Open", target: { type: "page", url: "/orders/{{row._id}}" } },
      { _id: "o2" },
    );
    await vi.waitFor(() => expect(navigateDms).toHaveBeenCalledTimes(1));
    expect(navigateDms).toHaveBeenCalledWith("/orders/o2");
  });
});
