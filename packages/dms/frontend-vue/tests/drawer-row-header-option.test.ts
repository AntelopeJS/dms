// @vitest-environment jsdom
/**
 * A module opening a drawer on a row of its own list (`useDrawer`) asks for
 * the DMS's row header with `rowHeader`, rather than importing the layer's
 * header component: the row's title, its position, previous / next and J / K,
 * as on a row action's drawer, patched as the drawer steps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type Component } from "vue";
import RowHeader from "../layers/dms-ui/app/build/components/containers/row/RowHeader.vue";
import type { RowNavigation } from "../layers/dms-ui/app/types/row-navigation";

const Editor = defineComponent({ name: "KeyEditor", render: () => null });

interface CreatedDrawer {
  props: Record<string, unknown>;
  patch: ReturnType<typeof vi.fn>;
  settle: (value?: unknown) => void;
}

let created: CreatedDrawer[];

beforeEach(() => {
  created = [];
  vi.stubGlobal("markRaw", <T>(value: T) => value);
  vi.stubGlobal("useOverlay", () => ({
    create: (
      _component: unknown,
      { props }: { props: Record<string, unknown> },
    ) => {
      let settle!: (value?: unknown) => void;
      const opened = new Promise((resolve) => {
        settle = resolve;
      });
      const patch = vi.fn();
      created.push({ props, patch, settle });
      return { open: () => opened, close: vi.fn(), patch };
    },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const navigation = (index: number): RowNavigation => ({
  index,
  total: 12,
  hasPrev: index > 0,
  hasNext: index < 11,
  prev: vi.fn(),
  next: vi.fn(),
});

async function openDrawer(options: Record<string, unknown>) {
  const { useDrawer } = await import(
    "../layers/dms-ui/app/composables/containers/useDrawer"
  );
  return useDrawer().open({ title: "Key", component: Editor, ...options });
}

const pressKey = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));

describe("useDrawer's row header", () => {
  it("draws the DMS's row header with the row's title and position", async () => {
    const steps = navigation(3);
    await openDrawer({
      rowHeader: {
        title: "billing.invoice.title",
        positionLabel: "$lang.keys.position",
        navigation: steps,
      },
    });
    const [{ props }] = created;
    expect(props.headerComponent).toBe(RowHeader);
    expect(props.headerComponentOptions).toMatchObject({
      part: "dms-row-drawer",
      heading: "billing.invoice.title",
      positionLabel: "$lang.keys.position",
      navigation: steps,
    });
    expect(props.rowHeader).toBeUndefined();
  });

  it("passes the title's look, the subtitle and the component", async () => {
    const Pills: Component = { name: "KeyPills", render: () => null };
    const drawer = await openDrawer({
      rowHeader: {
        title: "billing.invoice.title",
        titleClass: "font-mono",
        titleBreakAfter: ".",
        subtitle: "helio › billing",
        subtitleClass: "font-mono",
        component: Pills,
        componentOptions: { missing: 2 },
      },
    });
    const options = created[0]!.props.headerComponentOptions as Record<
      string,
      unknown
    >;
    expect(options.headingClass).toMatch(/text-\[17px\].* font-mono$/);
    expect(options).toMatchObject({
      headingBreakAfter: ".",
      subtitle: "helio › billing",
      subtitleClass: "font-mono",
      component: Pills,
      componentOptions: { missing: 2 },
    });
    drawer.patch({
      rowHeader: { title: "billing.total", subtitle: "helio › other" },
    });
    expect(created[0]!.patch).toHaveBeenCalledWith({
      headerComponentOptions: expect.objectContaining({
        heading: "billing.total",
        subtitle: "helio › other",
        component: undefined,
      }),
    });
  });

  it("titles the header with the drawer's title without its own", async () => {
    await openDrawer({ rowHeader: {} });
    expect(created[0]!.props.headerComponentOptions).toMatchObject({
      heading: "Key",
    });
  });

  it("follows the row a patch steps to", async () => {
    const drawer = await openDrawer({
      rowHeader: { title: "First", navigation: navigation(0) },
    });
    const next = navigation(1);
    drawer.patch({
      componentOptions: { id: "k2" },
      rowHeader: { title: "Second", navigation: next },
    });
    expect(created[0]!.patch).toHaveBeenCalledWith({
      componentOptions: { id: "k2" },
      headerComponentOptions: expect.objectContaining({
        heading: "Second",
        navigation: next,
      }),
    });
  });

  it("steps with J and K while open, and no more once closed", async () => {
    const first = navigation(2);
    const drawer = await openDrawer({ rowHeader: { navigation: first } });
    pressKey("j");
    expect(first.next).toHaveBeenCalledOnce();
    const second = navigation(3);
    drawer.patch({ rowHeader: { navigation: second } });
    pressKey("k");
    expect(second.prev).toHaveBeenCalledOnce();
    created[0]!.settle();
    await Promise.resolve();
    await Promise.resolve();
    pressKey("j");
    expect(second.next).not.toHaveBeenCalled();
  });

  it("keeps a drawer without one as it was", async () => {
    const drawer = await openDrawer({});
    expect(created[0]!.props.headerComponent).toBeUndefined();
    drawer.patch({ title: "Other" });
    expect(created[0]!.patch).toHaveBeenCalledWith({ title: "Other" });
  });
});
