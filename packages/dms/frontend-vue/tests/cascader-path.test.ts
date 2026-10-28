/** @vitest-environment jsdom */
/**
 * A cascader cell names its value by its path ("Electronics / Audio"), read
 * by `?ids=` for the picked rows the list did not join and the ancestors,
 * whatever the size of the tree; a picked row the route does not answer reads "Not found", its id
 * on hover.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  Suspense,
  toValue,
  type App,
} from "vue";
import CascaderPath from "../layers/dms-ui/app/components/table-view/CascaderPath.vue";

const SEARCH_URL = "/api/categories/select";
const KEY_MAPPING = { label: "name", value: "_id", parent: "parent" };

const ROWS: Record<string, { _id: string; name: string; parent?: string }> = {
  electronics: { _id: "electronics", name: "Electronics" },
  audio: { _id: "audio", name: "Audio", parent: "electronics" },
  speakers: { _id: "speakers", name: "Speakers", parent: "audio" },
};

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

async function mountCell(value: unknown) {
  vi.stubGlobal("computed", vue.computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  const reads: unknown[] = [];
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: vi.fn(async (url: string, options: { params: unknown }) => {
      reads.push({ url, params: options.params });
      const { ids } = options.params as { ids: string[] };
      return { results: ids.flatMap((id) => (ROWS[id] ? [ROWS[id]] : [])) };
    }),
  }));
  vi.stubGlobal(
    "useDmsAsyncData",
    async (key: unknown, read: () => Promise<unknown>) => {
      toValue(key);
      const data = ref<unknown>();
      void read().then((result) => (data.value = result));
      return { data };
    },
  );
  const Host = defineComponent({
    render: () =>
      h(Suspense, null, {
        default: () =>
          h(CascaderPath, {
            value,
            searchUrl: SEARCH_URL,
            keyMapping: KEY_MAPPING,
          }),
      }),
  });
  app = createApp(Host);
  app.component("UBadge", (props: { label: string; title: string }) =>
    h("span", { "data-badge": "", title: props.title }, props.label),
  );
  const host = document.createElement("div");
  app.mount(host);
  for (let tick = 0; tick < 6; tick++) {
    await new Promise((resolve) => setTimeout(resolve));
    await nextTick();
  }
  return { host, reads };
}

describe("a cascader cell", () => {
  it("reads a plain id and its ancestors by ids, not a page of the route", async () => {
    const { host, reads } = await mountCell("speakers");
    expect(host.textContent?.trim()).toBe("Electronics / Audio / Speakers");
    expect(reads).toEqual([
      {
        url: SEARCH_URL,
        params: { ids: ["speakers"], idKey: "_id", limit: 1 },
      },
      { url: SEARCH_URL, params: { ids: ["audio"], idKey: "_id", limit: 1 } },
      {
        url: SEARCH_URL,
        params: { ids: ["electronics"], idKey: "_id", limit: 1 },
      },
    ]);
  });

  it("reads only the ancestors of a row the list joined, and nothing for a root", async () => {
    const joined = await mountCell(ROWS.speakers);
    expect(joined.host.textContent?.trim()).toBe(
      "Electronics / Audio / Speakers",
    );
    expect(joined.reads).toEqual([
      { url: SEARCH_URL, params: { ids: ["audio"], idKey: "_id", limit: 1 } },
      {
        url: SEARCH_URL,
        params: { ids: ["electronics"], idKey: "_id", limit: 1 },
      },
    ]);
    app?.unmount();
    const root = await mountCell(ROWS.electronics);
    expect(root.host.textContent?.trim()).toBe("Electronics");
    expect(root.reads).toEqual([]);
  });

  it("reads a row the route does not answer as not found, its id on hover", async () => {
    const { host } = await mountCell("gone");
    const cell = host.querySelector("[title]")!;
    expect(cell.textContent?.trim()).toBe("dms.form.relation.not_found");
    expect(cell.getAttribute("title")).toBe("gone");
  });

  it("names each pick of a multiple value by its own label, its path on hover", async () => {
    const { host } = await mountCell(["speakers", "gone"]);
    const badges = [...host.querySelectorAll("[data-badge]")].map((badge) => [
      badge.textContent,
      badge.getAttribute("title"),
    ]);
    expect(badges).toEqual([
      ["Speakers", "Electronics / Audio / Speakers"],
      ["dms.form.relation.not_found", "gone"],
    ]);
  });
});
