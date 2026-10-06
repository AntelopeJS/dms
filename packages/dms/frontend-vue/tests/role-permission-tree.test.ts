// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type App,
  type Component,
  computed,
  createApp,
  defineComponent,
  type FunctionalComponent,
  h,
  nextTick,
  ref,
} from "vue";
import type { RolePermissionNode } from "../layers/dms-layout/app/build/components/pages/settings/roles/role-types";

// The tree components lean on Nuxt auto-imports; provide what they read.
Object.assign(globalThis, {
  computed,
  ref,
  // Named values are appended, so a test can read them back.
  useI18n: () => ({
    t: (key: string, named?: unknown) =>
      named && typeof named === "object"
        ? `${key} ${Object.values(named).join("/")}`
        : key,
  }),
  useTranslation: () => ({ processI18n: (label: string) => label }),
});

const TREE: RolePermissionNode[] = [
  {
    id: "pages",
    label: "Pages",
    children: [
      {
        id: "pages.form",
        label: "Form",
        children: [
          {
            id: "pages.form.simple",
            label: "Simple form",
            children: [{ id: "pages.form.simple.form", label: "Form" }],
          },
          {
            id: "pages.form.table",
            label: "Table page",
            children: [
              {
                id: "pages.form.table.table",
                label: "Table",
                children: [
                  {
                    id: "pages.form.table.table.add",
                    label: "Add",
                    children: [
                      { id: "pages.form.table.table.add.form", label: "Form" },
                    ],
                  },
                  { id: "pages.form.table.table.list", label: "List" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    children: [
      {
        id: "settings.user",
        label: "User settings",
        children: [
          {
            id: "settings.user.profile",
            label: "Profile",
            children: [{ id: "settings.user.profile.profile", label: "Info" }],
          },
        ],
      },
    ],
  },
];

const stub = (tag: string) =>
  defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h(tag, { type: "button" }, slots.default?.()),
  });

const CheckboxStub = defineComponent({
  props: { modelValue: [Boolean, String], disabled: Boolean },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("button", {
        type: "button",
        role: "checkbox",
        "aria-checked": String(props.modelValue),
        onClick: (event: Event) => {
          event.stopPropagation();
          emit("update:modelValue", props.modelValue !== true);
        },
      }),
});

let RolePermissionTree: Component;
let RoleEditor: Component;
let helpers: typeof import("../layers/dms-layout/app/build/components/pages/settings/roles/role-permissions");
let app: App | undefined;

beforeAll(async () => {
  helpers = await import(
    "../layers/dms-layout/app/build/components/pages/settings/roles/role-permissions"
  );
  RolePermissionTree = (
    await import(
      "../layers/dms-layout/app/build/components/pages/settings/roles/RolePermissionTree.vue"
    )
  ).default;
  RoleEditor = (
    await import(
      "../layers/dms-layout/app/build/components/pages/settings/roles/RoleEditor.vue"
    )
  ).default;
});

afterEach(() => app?.unmount());

function mountTree() {
  const host = document.createElement("div");
  const index = helpers.buildPermissionIndex(TREE);
  const areas = helpers.buildPermissionAreas(TREE, (label) => label);
  const expanded = ref(new Set<string>());
  const toggles: Array<[string, boolean]> = [];
  app = createApp({
    setup: () => () =>
      h(RolePermissionTree, {
        areas,
        index,
        selection: new Set<string>(),
        saved: new Set<string>(),
        autoAdded: new Map(),
        expanded: expanded.value,
        hits: null,
        query: "",
        canGrant: () => true,
        readonly: false,
        onToggle: (id: string, checked: boolean) => toggles.push([id, checked]),
        "onToggle-area": (id: string) => {
          const next = new Set(expanded.value);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          expanded.value = next;
        },
      }),
  });
  app.component("UCheckbox", CheckboxStub);
  app.component("UButton", stub("button"));
  app.component("UIcon", stub("i"));
  app.component("DmsMeter", stub("span"));
  app.mount(host);
  return { host, index, expanded, toggles };
}

const shownIds = (host: HTMLElement) =>
  [...host.querySelectorAll("[data-permission-id]")].map((element) =>
    element.getAttribute("data-permission-id"),
  );

function rowOf(host: HTMLElement, id: string): HTMLElement {
  const row = host.querySelector<HTMLElement>(`[data-permission-id="${id}"]`);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

function caretOf(host: HTMLElement, id: string): HTMLButtonElement {
  const row = rowOf(host, id);
  const caret = row.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (!caret) throw new Error(`no caret for ${id}`);
  return caret;
}

describe("nested role permission tree", () => {
  it("starts with only the section headings and closed areas", () => {
    const { host } = mountTree();
    expect(shownIds(host)).toEqual([
      "pages",
      "pages.form",
      "settings",
      "settings.user",
    ]);
    expect(caretOf(host, "pages.form").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("opens one level at a time, each child with children closed", async () => {
    const { host } = mountTree();
    caretOf(host, "pages.form").click();
    await nextTick();
    expect(shownIds(host)).toEqual([
      "pages",
      "pages.form",
      "pages.form.simple",
      "pages.form.table",
      "settings",
      "settings.user",
    ]);
    const table = caretOf(host, "pages.form.table");
    expect(table.getAttribute("aria-expanded")).toBe("false");
    expect(table.getAttribute("aria-controls")).toBe(
      helpers.childrenElementId("pages.form.table"),
    );

    table.click();
    await nextTick();
    expect(shownIds(host)).toContain("pages.form.table.table");
    expect(shownIds(host)).not.toContain("pages.form.table.table.add");
    const group = host.querySelector(
      `[id="${helpers.childrenElementId("pages.form.table")}"]`,
    );
    expect(group?.getAttribute("role")).toBe("group");
  });

  it("reaches every node of the tree through the collapsibles", async () => {
    const { host, index } = mountTree();
    for (;;) {
      const closed = host.querySelector<HTMLButtonElement>(
        'button[aria-expanded="false"]',
      );
      if (!closed) break;
      closed.click();
      await nextTick();
    }
    expect([...new Set(shownIds(host))].sort()).toEqual(
      [...index.allIds].sort(),
    );
  });

  it("grants a closed row's subtree from its checkbox", async () => {
    const { host, toggles } = mountTree();
    caretOf(host, "pages.form").click();
    await nextTick();
    rowOf(host, "pages.form.table")
      .querySelector<HTMLButtonElement>('[role="checkbox"]')
      ?.click();
    expect(toggles).toEqual([["pages.form.table", true]]);
    // Ticking does not open the row.
    expect(shownIds(host)).not.toContain("pages.form.table.table");
  });
});

const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("input", {
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      }),
});

interface SearchInputStubProps {
  modelValue?: string;
  placeholder?: string;
}

// DmsSearchInput: an input named by its placeholder.
const SearchInputStub: FunctionalComponent<SearchInputStubProps> = (
  props,
  { attrs },
) => h(InputStub, { ...attrs, ...props, "aria-label": props.placeholder });
SearchInputStub.props = ["modelValue", "placeholder"];

vi.mock("../layers/dms-ui/app/build/components/form/SearchInput.vue", () => ({
  default: SearchInputStub,
}));

const slotStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function mountEditor() {
  const host = document.createElement("div");
  const index = helpers.buildPermissionIndex(TREE);
  const areas = helpers.buildPermissionAreas(TREE, (label) => label);
  app = createApp({
    setup: () => () =>
      h(RoleEditor, {
        isNew: false,
        memberCount: 0,
        members: [],
        areas,
        index,
        selection: new Set<string>(),
        saved: new Set<string>(),
        autoAdded: new Map(),
        totalPermissions: index.allIds.length,
        canGrant: () => true,
        readonly: false,
        canDuplicate: true,
        canDelete: true,
        dirty: false,
        saving: false,
        changes: [],
        name: "Editors",
        description: "",
      }),
  });
  app.component("UCheckbox", CheckboxStub);
  app.component("UButton", stub("button"));
  app.component("UIcon", stub("i"));
  app.component("UInput", InputStub);
  app.component("UFormField", slotStub);
  app.component("UDropdownMenu", slotStub);
  app.component("DmsMeter", stub("span"));
  app.component("DmsIconWell", stub("span"));
  app.component("DmsSaveBar", stub("div"));
  app.mount(host);
  return { host };
}

/** Ids of the rows shown open, in tree order. */
const openIds = (host: HTMLElement) =>
  [
    ...host.querySelectorAll(
      '[role="treeitem"][aria-expanded="true"] > [data-permission-id]',
    ),
  ].map((element) => element.getAttribute("data-permission-id"));

function levelButton(host: HTMLElement, which: "expand" | "collapse") {
  const button = host.querySelector<HTMLButtonElement>(
    `[data-role-tree-${which}]`,
  );
  if (!button) throw new Error(`no ${which} button`);
  return button;
}

const depthText = (host: HTMLElement) =>
  host.querySelector("[data-role-tree-depth] [aria-hidden]")?.textContent;

describe("role editor level buttons", () => {
  it("opens one depth per click, then closes one depth per click", async () => {
    const { host } = mountEditor();
    const expand = levelButton(host, "expand");
    const collapse = levelButton(host, "collapse");
    expect(expand.getAttribute("aria-label")).toBe(
      "page.settings.roles.editor.expand_level",
    );
    expect(openIds(host)).toEqual([]);
    expect(collapse.disabled).toBe(true);
    expect(depthText(host)?.trim()).toBe(
      "page.settings.roles.editor.depth 0/4",
    );

    const afterExpand: Array<Array<string | null>> = [];
    while (!expand.disabled) {
      expand.click();
      await nextTick();
      afterExpand.push(openIds(host));
    }
    expect(afterExpand).toEqual([
      ["pages.form", "settings.user"],
      [
        "pages.form",
        "pages.form.simple",
        "pages.form.table",
        "settings.user",
        "settings.user.profile",
      ],
      [
        "pages.form",
        "pages.form.simple",
        "pages.form.table",
        "pages.form.table.table",
        "settings.user",
        "settings.user.profile",
      ],
      [
        "pages.form",
        "pages.form.simple",
        "pages.form.table",
        "pages.form.table.table",
        "pages.form.table.table.add",
        "settings.user",
        "settings.user.profile",
      ],
    ]);
    expect(depthText(host)?.trim()).toBe(
      "page.settings.roles.editor.depth 4/4",
    );
    expect(collapse.disabled).toBe(false);

    const afterCollapse: Array<Array<string | null>> = [];
    while (!collapse.disabled) {
      collapse.click();
      await nextTick();
      afterCollapse.push(openIds(host));
    }
    expect(afterCollapse).toEqual([
      afterExpand[2],
      afterExpand[1],
      afterExpand[0],
      [],
    ]);
    expect(expand.disabled).toBe(false);
  });

  it("fills the shallowest incomplete depth after rows opened by hand", async () => {
    const { host } = mountEditor();
    caretOf(host, "pages.form").click();
    await nextTick();
    caretOf(host, "pages.form.table").click();
    await nextTick();
    // Depth 1 is still incomplete (`settings.user` closed): it opens first.
    levelButton(host, "expand").click();
    await nextTick();
    expect(openIds(host)).toEqual([
      "pages.form",
      "pages.form.table",
      "settings.user",
    ]);
    levelButton(host, "expand").click();
    await nextTick();
    expect(openIds(host)).toEqual([
      "pages.form",
      "pages.form.simple",
      "pages.form.table",
      "settings.user",
      "settings.user.profile",
    ]);
    // Collapse closes the deepest depth shown open, depth 2 here.
    levelButton(host, "collapse").click();
    await nextTick();
    expect(openIds(host)).toEqual(["pages.form", "settings.user"]);
  });

  it("hides the buttons while searching and restores the open rows after", async () => {
    const { host } = mountEditor();
    levelButton(host, "expand").click();
    await nextTick();
    const search = host.querySelector<HTMLInputElement>(
      'input[aria-label="page.settings.roles.editor.search_permissions"]',
    );
    if (!search) throw new Error("no search input");
    search.value = "table";
    search.dispatchEvent(new Event("input"));
    await nextTick();
    expect(host.querySelector("[data-role-tree-expand]")).toBeNull();
    expect(host.querySelector("[data-role-tree-depth]")).toBeNull();
    expect(openIds(host)).toEqual([]);
    search.value = "";
    search.dispatchEvent(new Event("input"));
    await nextTick();
    expect(openIds(host)).toEqual(["pages.form", "settings.user"]);
    expect(levelButton(host, "collapse").disabled).toBe(false);
  });
});
