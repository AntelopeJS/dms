// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, h, ref } from "vue";

const data = ref<Record<string, unknown> | null>(null);
const error = ref<unknown>(null);
const isLoading = ref(false);
const fetchOptions = vi.fn();

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: unknown) => {
    fetchOptions(options);
    return { data, isLoading, error, refresh: async () => {} };
  },
}));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));

let app: App | undefined;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));
let host: HTMLDivElement;

type MountProps = Record<string, unknown> | (() => Record<string, unknown>);

// Props given as a getter are read on each render: a test changes them live.
async function mount(path: string, props: MountProps) {
  const { default: component } = await import(path);
  const read = typeof props === "function" ? props : () => props;
  app = createApp({ setup: () => () => h(component, read()) });
  for (const name of ["UIcon", "USkeleton", "UButton"]) {
    app.component(name, (_, { attrs }) =>
      h("i", { ...attrs, "data-stub": name }),
    );
  }
  app.mount(host);
  await flushPromises();
  await vi.dynamicImportSettled();
  await flushPromises();
}

const mountSnippet = (props: MountProps) =>
  mount("../layers/dms-ui/app/components/code-snippet/CodeSnippet.vue", props);
const mountBlock = (props: Record<string, unknown>) =>
  mount("../layers/dms-ui/app/components/blocks/CodeBlock.vue", {
    componentId: "code",
    pageId: "page",
    ...props,
  });

const pre = () => host.querySelector("pre")!;
const copyButton = () => host.querySelector("button");

beforeEach(() => {
  data.value = null;
  error.value = null;
  isLoading.value = false;
  fetchOptions.mockClear();
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("DmsCodeSnippet", () => {
  it("highlights the code in its language, under a head naming it", async () => {
    await mountSnippet({
      code: '{ "id": 1 }',
      language: "json",
      title: "Body",
    });
    expect(pre().textContent).toBe('{ "id": 1 }');
    expect(pre().querySelector('[style*="--ui-info"]')?.textContent).toBe(
      '"id"',
    );
    expect(host.textContent).toContain("Body");
    expect(host.textContent).toContain("JSON");
    expect(copyButton()).not.toBeNull();
  });

  it("colours with the grammar of a language set after it mounted", async () => {
    const language = ref("json");
    await mountSnippet(() => ({ code: "echo 1", language: language.value }));
    expect(pre().querySelector('[style*="--ui-primary"]')).toBeNull();
    language.value = "bash";
    await flushPromises();
    await vi.dynamicImportSettled();
    await flushPromises();
    expect(pre().dataset.language).toBe("shell");
    expect(pre().querySelector('[style*="--ui-primary"]')?.textContent).toBe(
      "echo",
    );
  });

  it("reads an alias as its language", async () => {
    await mountSnippet({ code: "pnpm install", language: "bash" });
    expect(pre().dataset.language).toBe("shell");
    expect(host.textContent).toContain("Shell");
  });

  it("drops the copy button and the head when nothing is left to show", async () => {
    await mountSnippet({ code: "plain words", copy: false });
    expect(copyButton()).toBeNull();
    expect(pre().previousElementSibling).toBeNull();
  });

  it("floats the copy button in the code's corner without a title or a language", async () => {
    await mountSnippet({ code: '{"ok":true}' });
    expect(host.querySelector("[data-floating-copy]")).toBe(copyButton());
    expect(host.textContent).not.toContain("Text");
    expect(pre().className).toContain("pe-10");
  });

  it("keeps the head of a snippet naming its language", async () => {
    await mountSnippet({ code: "plain words", language: "text" });
    expect(host.querySelector("[data-floating-copy]")).toBeNull();
    expect(copyButton()).not.toBeNull();
    expect(pre().className).not.toContain("pe-10");
  });

  it("breaks a word too long for the line with wrap anywhere", async () => {
    await mountSnippet({ code: "x".repeat(400), wrap: "anywhere" });
    expect(pre().className).toContain("[overflow-wrap:anywhere]");
    expect(pre().className).toContain("whitespace-pre-wrap");
  });

  it("caps the height with a CSS length when no line count is set", async () => {
    await mountSnippet({ code: "a", maxHeight: "20rem" });
    expect(pre().style.maxHeight).toBe("20rem");
    app?.unmount();
    await mountSnippet({ code: "a\nb", maxHeight: "20rem", maxLines: 1 });
    expect(pre().style.maxHeight).toBe("35px");
  });

  it("wraps long lines or scrolls them, and caps the height in lines", async () => {
    await mountSnippet({ code: "a\nb\nc", wrap: true, maxLines: 2 });
    expect(pre().className).toContain("whitespace-pre-wrap");
    expect(pre().style.maxHeight).toBe("54px");
    app?.unmount();
    await mountSnippet({ code: "a" });
    expect(pre().className).toContain("whitespace-pre");
    expect(pre().className).not.toContain("whitespace-pre-wrap");
    expect(pre().style.maxHeight).toBe("");
  });
});

describe("CodeBlock", () => {
  it("shows its static code and title", async () => {
    await mountBlock({ code: "SELECT 1", language: "sql", title: "Query" });
    expect(pre().textContent).toBe("SELECT 1");
    expect(host.textContent).toContain("Query");
  });

  it("replaces the code and the language with what its route answers", async () => {
    data.value = { code: "echo hi", language: "shell" };
    await mountBlock({
      code: "old",
      language: "json",
      fetchUrl: "/api/snippet",
    });
    expect(fetchOptions).toHaveBeenCalledWith(
      expect.objectContaining({ fetchUrl: "/api/snippet" }),
    );
    expect(pre().textContent).toBe("echo hi");
    expect(pre().dataset.language).toBe("shell");
  });

  it("draws placeholder lines until the first answer", async () => {
    isLoading.value = true;
    await mountBlock({ fetchUrl: "/api/snippet" });
    expect(host.querySelector("pre")).toBeNull();
    expect(host.querySelector("[aria-busy]")).not.toBeNull();
  });

  it("offers a retry when the first load fails", async () => {
    error.value = new Error("network");
    await mountBlock({ fetchUrl: "/api/snippet" });
    expect(host.querySelector("pre")).toBeNull();
    expect(host.textContent).toContain("dms.blocks.load_error");
  });
});

describe("EmptyState block", () => {
  it("shows a snippet between its text and its actions", async () => {
    await mount("../layers/dms-ui/app/components/blocks/EmptyStateBlock.vue", {
      title: "No email sent yet",
      code: { content: "await mail.send({ to })", language: "typescript" },
    });
    expect(pre().textContent).toBe("await mail.send({ to })");
    expect(host.textContent).toContain("TypeScript");
    expect(copyButton()).not.toBeNull();
  });
});
