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

async function mount(path: string, props: Record<string, unknown>) {
  const { default: component } = await import(path);
  app = createApp({ setup: () => () => h(component, props) });
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

const mountSnippet = (props: Record<string, unknown>) =>
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
