/**
 * `usePageRecordLabel`, public: the label a record page's header ends its
 * breadcrumb with, held with its page's path so it never outlives the page,
 * and still reachable from its former `build/` path.
 */
import { reactive, ref, type Ref } from "vue";
import { beforeEach, expect, it, vi } from "vitest";

const route = reactive({ path: "/modules/api/routes" });
let sharedState: Map<string, Ref<unknown>>;

vi.stubGlobal("useDmsRoute", () => route);
vi.stubGlobal("useDmsState", <T>(key: string, init?: () => T): Ref<T> => {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  return sharedState.get(key) as Ref<T>;
});

const { usePageRecordLabel } = await import(
  "../layers/dms-core/app/composables/page/usePageRecordLabel"
);

beforeEach(() => {
  sharedState = new Map();
  route.path = "/modules/api/routes";
});

it("reads the label set for the page on screen, shared between callers", () => {
  const writer = usePageRecordLabel();
  const reader = usePageRecordLabel();

  writer.setLabel(route.path, "GET /api/invoices");

  expect(reader.label.value).toBe("GET /api/invoices");
});

it("never shows a label on another page, and clears with no value", () => {
  const { label, setLabel } = usePageRecordLabel();
  setLabel(route.path, "GET /api/invoices");

  route.path = "/modules/api/logs";
  expect(label.value).toBeUndefined();

  route.path = "/modules/api/routes";
  setLabel(route.path, undefined);
  expect(label.value).toBeUndefined();
});
