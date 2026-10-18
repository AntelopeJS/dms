// @vitest-environment jsdom
/**
 * The Prose block draws Markdown as elements of its own — never an HTML
 * string — so raw HTML and script addresses never reach the page; reads its
 * text from its options (as is, a `$` key or one text per locale) or from a
 * route answering `{ markdown }` in the reader's language; and draws the same
 * on the server as in the browser, so hydration changes nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, createSSRApp, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";

const data = ref<Record<string, unknown> | null>(null);
const error = ref<unknown>(null);
const isLoading = ref(false);
const fetchOptions = vi.fn();
const locale = ref("en-GB");

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: unknown) => {
    fetchOptions(options);
    return { data, isLoading, error, refresh: async () => {} };
  },
}));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));

const { default: ProseBlock } = await import(
  "../layers/dms-ui/app/components/blocks/ProseBlock.vue"
);

const STUBS = ["UIcon", "USkeleton", "UButton"];
// A functional stub: the link a DMS route is drawn with.
const DmsLinkStub = (
  props: { to: string },
  { slots }: { slots: { default?: () => unknown } },
) =>
  h("a", { href: props.to, "data-dms-link": "" }, slots.default?.() as never);
DmsLinkStub.props = ["to"];

function install(app: App): App {
  for (const name of STUBS)
    app.component(name, (_, { attrs }) =>
      h("i", { ...attrs, "data-stub": name }),
    );
  app.component("DmsLink", DmsLinkStub);
  return app;
}

let app: App | undefined;
let host: HTMLDivElement;

const flush = () => new Promise((resolve) => setTimeout(resolve));

async function mount(props: Record<string, unknown>) {
  app = install(createApp({ setup: () => () => h(ProseBlock, props) }));
  app.mount(host);
  await flush();
}

beforeEach(() => {
  data.value = null;
  error.value = null;
  isLoading.value = false;
  locale.value = "en-GB";
  fetchOptions.mockClear();
  vi.stubGlobal("useI18n", () => ({
    locale,
    fallbackLocale: ref("en-GB"),
    t: (key: string) => key,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => `translated:${key}`,
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

const GUIDE = `# Welcome

Read the **guide**, then *start*.

## Install

- [x] Create the workspace
- [ ] Invite the team

1. One
2. Two

> [!TIP]
> Import a CSV first.

> A plain quote.

| Plan | Seats |
|:-----|------:|
| Pro  | 10    |

\`\`\`json
{ "id": 1 }
\`\`\`

---

![Dashboard](/images/dashboard.png "The dashboard")

[Orders](/orders/orders-list), [site](https://example.com), [mail](mailto:ada@example.com), [top](#welcome) and \`inline\`.
`;

describe("ProseBlock", () => {
  it("draws every Markdown element with its own element", async () => {
    await mount({ content: GUIDE });

    const article = host.querySelector("article")!;
    expect(article.querySelector("h2#welcome")?.textContent).toContain(
      "Welcome",
    );
    expect(article.querySelector("h2#install a[href='#install']")).not.toBe(
      null,
    );
    expect(article.querySelector("strong")?.textContent).toBe("guide");
    expect(article.querySelector("em")?.textContent).toBe("start");
    const boxes = article.querySelectorAll<HTMLInputElement>(
      "input[type=checkbox]",
    );
    expect([...boxes].map((box) => [box.checked, box.disabled])).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(article.querySelectorAll("ol > li")).toHaveLength(2);
    expect(article.querySelector("[data-callout=tip]")?.textContent).toContain(
      "Import a CSV first.",
    );
    expect(article.querySelector("blockquote")?.textContent).toContain(
      "A plain quote.",
    );
    expect(article.querySelector("th")?.style.textAlign).toBe("left");
    expect(article.querySelectorAll("td")[1]?.style.textAlign).toBe("right");
    expect(article.querySelector("pre")?.textContent).toBe('{ "id": 1 }');
    expect(article.querySelector("hr")).not.toBe(null);
    expect(article.querySelector("figure img")?.getAttribute("src")).toBe(
      "/images/dashboard.png",
    );
    expect(article.querySelector("figcaption")?.textContent).toBe(
      "The dashboard",
    );
    expect(article.querySelector("p code")?.textContent).toBe("inline");
  });

  it("routes a dashboard link in place and opens another site in a new tab", async () => {
    await mount({ content: GUIDE });

    const link = (text: string) =>
      [...host.querySelectorAll("a")].find((a) => a.textContent === text)!;
    expect(link("Orders").hasAttribute("data-dms-link")).toBe(true);
    expect(link("site").getAttribute("target")).toBe("_blank");
    expect(link("site").getAttribute("rel")).toBe("noopener noreferrer");
    expect(link("mail").getAttribute("target")).toBe(null);
    expect(link("top").getAttribute("href")).toBe("#welcome");
  });

  it("never draws raw HTML nor a script address", async () => {
    await mount({
      content: [
        "<script>alert(1)</script>",
        "",
        'Hi <img src=x onerror="alert(1)"> <b>bold</b>',
        "",
        "[click](javascript:alert(1)) [data](data:text/html,x)",
        "",
        "![pixel](javascript:alert(1))",
      ].join("\n"),
    });

    const article = host.querySelector("article")!;
    expect(article.querySelector("script, b, img")).toBe(null);
    expect(article.innerHTML).not.toContain("javascript:");
    expect(article.innerHTML).not.toContain("onerror");
    expect(article.textContent).toContain("click");
    expect(article.textContent).toContain("bold");
    expect(article.textContent).toContain("pixel");
  });

  it("lists the headings in a table of contents when asked", async () => {
    await mount({ content: GUIDE, toc: true });

    const nav = host.querySelector("nav")!;
    expect(nav.getAttribute("aria-labelledby")).toBeTruthy();
    expect(
      [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual(["#welcome", "#install"]);
  });

  it("keeps lines to a readable measure unless wide", async () => {
    await mount({ content: "Text" });
    expect(host.querySelector("[data-dms-prose]")?.className).toContain(
      "max-w-[72ch]",
    );
    app?.unmount();

    await mount({ content: "Text", width: "wide" });
    expect(host.querySelector("[data-dms-prose]")?.className).not.toContain(
      "max-w-[72ch]",
    );
  });

  it("reads the reader's text of a per-locale map, again on a switch", async () => {
    await mount({ content: { "en-GB": "Hello", "fr-FR": "Bonjour" } });
    expect(host.querySelector("article")?.textContent).toBe("Hello");

    locale.value = "fr-FR";
    await flush();
    expect(host.querySelector("article")?.textContent).toBe("Bonjour");
  });

  it("looks a $ key up in the reader's language", async () => {
    await mount({ content: "$help.intro" });

    expect(host.querySelector("article")?.textContent).toBe(
      "translated:$help.intro",
    );
  });

  it("draws the Markdown its route answers, asked again on a language switch", async () => {
    data.value = { markdown: "## From the route" };
    await mount({ content: "Static", fetchUrl: "/api/help/{{params.slug}}" });

    expect(host.querySelector("h2")?.textContent).toContain("From the route");
    const { watchSource } = fetchOptions.mock.calls[0]![0] as {
      watchSource: () => unknown;
    };
    const before = JSON.stringify(watchSource());
    locale.value = "fr-FR";
    expect(JSON.stringify(watchSource())).not.toBe(before);
  });

  it("shows placeholder lines while the route answers", async () => {
    isLoading.value = true;
    await mount({ fetchUrl: "/api/help/intro" });

    expect(host.querySelector("[aria-busy=true]")).not.toBe(null);
    expect(host.querySelector("article")).toBe(null);
  });

  it("hydrates over the server's render without a change", async () => {
    const props = { content: GUIDE, toc: true };
    const root = () => h(ProseBlock, props);
    const html = await renderToString(
      install(createSSRApp({ setup: () => root })),
    );
    host.innerHTML = html;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    app = install(createSSRApp({ setup: () => root }));
    app.mount(host);
    await flush();

    const mismatches = [...warn.mock.calls, ...errorLog.mock.calls].filter(
      (call) => String(call[0]).includes("Hydration"),
    );
    warn.mockRestore();
    errorLog.mockRestore();
    expect(mismatches).toEqual([]);
    expect(host.querySelector("h2#install")).not.toBe(null);
  });
});
