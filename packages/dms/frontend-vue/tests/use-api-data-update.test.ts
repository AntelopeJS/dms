// @vitest-environment jsdom
/**
 * Updating what `useApiData` read, through the runtime's real async data:
 * `useDmsData(key)` puts a write's answer in place (and back when the write
 * fails) or applies a realtime change, in every component showing the read,
 * without reading it again. The URL form names its key with `key`.
 */
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Task {
  id: string;
  title: string;
}

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
const requests: string[] = [];
const backend: Record<string, Task[]> = {
  "/api/tasks": [{ id: "1", title: "Write" }],
  "/api/archive": [{ id: "9", title: "Old" }],
};
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return structuredClone(backend[url]);
  },
}));
const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);

const settle = () => new Promise((done) => setTimeout(done, 10));
const apps: App[] = [];

function mount(setup: () => () => ReturnType<typeof h>): HTMLElement {
  const runtime = engine.createDmsFrontendRuntime(undefined, {});
  const app = createApp(defineComponent({ setup }));
  engine.provideDmsFrontendRuntime(app, runtime);
  const element = document.createElement("div");
  app.mount(element);
  apps.push(app);
  return element;
}

const titles = (tasks: Task[] | null | undefined) =>
  (tasks ?? []).map((task) => task.title).join(",");

beforeEach(() => {
  requests.length = 0;
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
});

afterAll(() => vi.unstubAllGlobals());

describe("useDmsData on a useApiData read", () => {
  it("puts a write's answer in place, and back when the write fails, without reading again", async () => {
    let tasks: ReturnType<typeof engine.useDmsData<Task[]>> | undefined;
    const element = mount(() => {
      const list = useApiData<Task[]>("/api/tasks", { key: "tasks" });
      const other = useApiData<Task[]>("/api/tasks", { key: "tasks" });
      tasks = engine.useDmsData<Task[]>("tasks");
      return () =>
        h("p", `${titles(list.data.value)}|${titles(other.data.value)}`);
    });
    await settle();
    expect(element.textContent).toBe("Write|Write");

    const previous = tasks!.data.value!;
    tasks!.data.value = [...previous, { id: "2", title: "Review" }];
    await nextTick();
    expect(element.textContent).toBe("Write,Review|Write,Review");

    // The write failed: what was there comes back.
    tasks!.data.value = previous;
    await nextTick();
    expect(element.textContent).toBe("Write|Write");
    expect(requests).toEqual(["/api/tasks"]);
  });

  it("applies a realtime change to a read another component shows", async () => {
    const Archive = defineComponent({
      setup() {
        const { data } = useApiData<Task[]>(
          "task-archive",
          ({ $authFetch, signal }) =>
            $authFetch<Task[]>("/api/archive", { signal }),
        );
        return () => h("p", titles(data.value));
      },
    });
    let archive: ReturnType<typeof engine.useDmsData<Task[]>> | undefined;
    const element = mount(() => {
      // A realtime listener of the page, which reads nothing itself.
      archive = engine.useDmsData<Task[]>("task-archive");
      return () => h("div", [h(Archive)]);
    });
    expect(archive!.data.value).toBeUndefined();
    await settle();
    expect(element.textContent).toBe("Old");

    // The event names the task it renamed.
    archive!.data.value = archive!.data.value!.map((task) =>
      task.id === "9" ? { ...task, title: "Renamed" } : task,
    );
    await nextTick();
    expect(element.textContent).toBe("Renamed");
    archive!.data.value![0]!.title = "Renamed again";
    await nextTick();
    expect(element.textContent).toBe("Renamed again");
    expect(requests).toEqual(["/api/archive"]);
  });
});
