// @vitest-environment jsdom
import { computed, createApp, h, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NavCardGridBlock from "../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue";

// The settings overview of a member without a role: the Workspace grid lists
// the workspace pages they can open, and they open none.

const categoryCards = ref<Array<{ id: string; title: string; to: string }>>([]);

// Hoisted with the mocks below, which render through it.
const { stub } = vi.hoisted(() => ({
  stub: (tag: string, attribute: string) => async () => {
    const vue = await import("vue");
    return {
      default: vue.defineComponent({
        inheritAttrs: false,
        props: ["title", "state"],
        setup: (props) => () =>
          vue.h(tag, { [attribute]: props.title ?? props.state ?? "" }),
      }),
    };
  },
}));

vi.mock(
  "#dms-layout/app/build/composables/navigation/useCategoryNavCards",
  () => ({
    useCategoryNavCards: () => ({ cards: categoryCards }),
    usePreviewEntryVeil: () => ({
      state: () => null,
      label: () => "",
      detail: () => undefined,
      isActive: ref(false),
    }),
  }),
);
vi.mock(
  "../layers/dms-ui/app/build/composables/blocks/useBlockItems",
  async () => {
    const { computed: vueComputed } = await import("vue");
    return {
      useBlockItems: () => ({
        items: vueComputed(() => []),
        isPending: vueComputed(() => false),
        hasError: vueComputed(() => false),
        refresh: vi.fn(),
      }),
    };
  },
);

vi.mock(
  "../layers/dms-ui/app/components/card/NavCard.vue",
  stub("a", "data-card"),
);
vi.mock(
  "../layers/dms-ui/app/build/components/permission/PermissionVeil.vue",
  async () => {
    const vue = await import("vue");
    return {
      default: vue.defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            vue.h("div", slots.default?.()),
      }),
    };
  },
);
vi.mock(
  "../layers/dms-ui/app/components/section-header/SectionHeader.vue",
  stub("h2", "data-title"),
);
vi.mock(
  "../layers/dms-ui/app/build/components/blocks/BlockStatus.vue",
  stub("p", "data-status"),
);

let app: App | undefined;

function mountGrid(props: Record<string, unknown>): HTMLElement {
  app = createApp({ render: () => h(NavCardGridBlock, props) });
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

beforeEach(() => {
  categoryCards.value = [];
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it("leaves out a category grid whose pages the viewer opens none of", () => {
  const container = mountGrid({
    categoryId: "settings.workspace",
    title: "$page.settings.shell.workspace",
  });
  expect(container.querySelector("section")).toBeNull();
});

it("lists the pages of the category the viewer can open", () => {
  categoryCards.value = [
    {
      id: "settings.workspace.members",
      title: "$menu.members",
      to: "/settings/workspace/members",
    },
  ];
  const container = mountGrid({
    categoryId: "settings.workspace",
    title: "$page.settings.shell.workspace",
  });
  expect(container.querySelector("[data-title]")).not.toBeNull();
  expect(container.querySelectorAll("[data-card]")).toHaveLength(1);
});

it("says what the page asks for when there is nothing to list", () => {
  const container = mountGrid({
    categoryId: "settings.workspace",
    empty: { title: "Nothing here" },
  });
  expect(container.querySelector("[data-status]")).not.toBeNull();
});
