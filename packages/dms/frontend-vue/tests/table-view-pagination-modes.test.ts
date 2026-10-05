import { computed, nextTick, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccumulatedPages } from "../layers/dms-ui/app/build/composables/table-view/useAccumulatedPages";

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pages loaded by more", () => {
  it("asks for every page loaded so far, and starts over when the list changes", async () => {
    const pagination = ref({ pageIndex: 0, pageSize: 20 });
    const search = ref("");
    const pages = useAccumulatedPages({
      mode: "infinite",
      pagination,
      resetOn: [search],
    });
    expect(pages.isAccumulating).toBe(true);
    pages.loadNextPage();
    pages.loadNextPage();
    expect(pages.requestedPagination.value).toEqual({
      pageIndex: 0,
      pageSize: 60,
    });
    search.value = "deploy";
    await nextTick();
    expect(pages.requestedPagination.value.pageSize).toBe(20);
  });

  it("leaves a paged list's pagination alone", () => {
    const pagination = ref({ pageIndex: 3, pageSize: 10 });
    const pages = useAccumulatedPages({
      mode: "pages",
      pagination,
      resetOn: [],
    });
    expect(pages.requestedPagination.value).toEqual({
      pageIndex: 3,
      pageSize: 10,
    });
  });
});
