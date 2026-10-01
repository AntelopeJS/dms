import { afterEach, describe, expect, it, vi } from "vitest";

const finderShortcut = {
  id: "finder.open",
  keys: ["enter"],
  description: "Open",
};

vi.mock("#shortcuts-aggregated", () => ({
  default: [
    {
      component: "Tab",
      shortcuts: [{ id: "tab.next", keys: ["ctrl", "tab"], description: "" }],
    },
    { component: "Finder", shortcuts: [finderShortcut] },
  ],
}));

describe("the shortcuts plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers every module's registry from the aggregate, not only dms-ui's", async () => {
    const registered: Array<[string, unknown]> = [];
    vi.stubGlobal("defineDmsPlugin", (setup: () => void) => setup);
    vi.stubGlobal("useShortcutRegistry", () => ({
      registerShortcut: (component: string, shortcut: unknown) =>
        registered.push([component, shortcut]),
    }));
    const { default: setup } = await import(
      "../layers/dms-ui/app/plugins/shortcuts"
    );
    (setup as () => void)();
    expect(registered.map(([component]) => component)).toEqual([
      "Tab",
      "Finder",
    ]);
    expect(registered[1]?.[1]).toEqual(finderShortcut);
  });
});
