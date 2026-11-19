import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { MockupSectionEdit } from "../../utils/mockupSections";

/** A category of the sidebar, as a section's header names it. */
export interface EditedCategory {
  id: string;
  title: string;
  icon?: string;
}

/** A section as a sidebar lists it: its category, none for the default one, and its pages. */
export interface EditedSection {
  category?: EditedCategory;
  items: readonly { id: string }[];
}

/** What is being dragged: a page, or a category's section. */
export type SectionDrag =
  | { kind: "page"; page: string }
  | { kind: "section"; category: string };

/**
 * Where a drop lands, drawn as a line: before the page `index` of the section
 * `section` (its index in the sidebar, the default one being 0), or before
 * the category `index` among the categories.
 */
export type SectionDrop =
  | { kind: "page"; section: number; index: number }
  | { kind: "section"; index: number };

/** The title being typed: a new section's, or the one of the category `category`. */
export interface SectionNaming {
  category?: string;
}

interface SectionEditingOptions {
  /** The sections as the sidebar lists them now. */
  sections: () => readonly EditedSection[];
  /** Hands a change to the spec's write path, or to the page that holds it. */
  edit: (edit: MockupSectionEdit) => void;
  t: (key: string) => string;
}

export interface MockupSectionEditing {
  naming: Ref<SectionNaming | undefined>;
  /** The title typed in the inline field. */
  draft: Ref<string>;
  /** The category whose icon is being picked. */
  pickingIcon: Ref<string | undefined>;
  dragging: Ref<SectionDrag | undefined>;
  drop: Ref<SectionDrop | undefined>;
  isNaming: (category?: string) => boolean;
  startNew: () => void;
  startRename: (category: EditedCategory) => void;
  /** Saves the typed title: a new section, or the category renamed. An empty title saves nothing. */
  commitName: () => void;
  cancelName: () => void;
  setIcon: (category: string, icon: string) => void;
  /** The ⋯ menu of a category: Rename, Icon, Delete. */
  menu: (category: EditedCategory) => DropdownMenuItem[];
  /**
   * The content props of that menu. A menu closing hands the focus back to its
   * trigger, which would blur the inline field its Rename or Icon entry just
   * opened and close it; while a field is open the focus stays where it is.
   */
  menuContent: { onCloseAutoFocus: (event: Event) => void };
  startPageDrag: (event: DragEvent, page: string) => void;
  startSectionDrag: (event: DragEvent, category: string) => void;
  /** The pointer is over the page `item` of the section `section`. */
  overPage: (event: DragEvent, section: number, item: number) => void;
  /** The pointer is over the section `section`, outside its pages. */
  overSection: (event: DragEvent, section: number) => void;
  /** Drops what is dragged where the line is, as one edit. */
  dropHere: (event: DragEvent) => void;
  endDrag: () => void;
  isDraggingSection: ComputedRef<boolean>;
}

/** Whether the pointer is in the lower half of the element the event is on. */
function isLowerHalf(event: DragEvent): boolean {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return false;
  const box = target.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
}

/** The index of the categories entry a section stands for: the default section is none. */
function categoryIndex(section: number): number {
  return section - 1;
}

/** The edit a drop makes, or none when it puts the dragged thing back where it was. */
export function dropEdit(
  sections: readonly EditedSection[],
  dragged: SectionDrag,
  drop: SectionDrop,
): MockupSectionEdit | undefined {
  if (dragged.kind === "section" && drop.kind === "section") {
    const from = sections.findIndex(
      (section) => section.category?.id === dragged.category,
    );
    if (from < 1) return undefined;
    const source = categoryIndex(from);
    const to = source < drop.index ? drop.index - 1 : drop.index;
    return to === source
      ? undefined
      : { kind: "moveCategory", category: dragged.category, to };
  }
  if (dragged.kind !== "page" || drop.kind !== "page") return undefined;
  const target = sections[drop.section];
  if (!target) return undefined;
  const at = target.items.findIndex((item) => item.id === dragged.page);
  const index = at >= 0 && at < drop.index ? drop.index - 1 : drop.index;
  if (at >= 0 && index === at) return undefined;
  return {
    kind: "movePageTo",
    page: dragged.page,
    category: target.category?.id ?? null,
    index,
  };
}

/** A category's ⋯ menu, each entry running its action. */
function sectionMenu(
  t: (key: string) => string,
  actions: { rename: () => void; icon: () => void; remove: () => void },
): DropdownMenuItem[] {
  return [
    {
      label: t("dms.mockup.section_rename"),
      icon: "i-ph-pencil-simple",
      onSelect: actions.rename,
    },
    {
      label: t("dms.mockup.section_icon"),
      icon: "i-ph-smiley",
      onSelect: actions.icon,
    },
    {
      label: t("dms.mockup.section_delete"),
      icon: "i-ph-trash",
      color: "error",
      onSelect: actions.remove,
    },
  ];
}

function startDrag(event: DragEvent, id: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
}

/**
 * Edits the sidebar's sections, wherever a sidebar lists them: a new section
 * named inline, a title renamed inline, a category's ⋯ menu (Rename, Icon,
 * Delete), and pages and sections dragged into place. Each change is one
 * {@link MockupSectionEdit} handed to `edit`; the page holding the spec
 * writes it, and asks before deleting a section that holds pages.
 */
export function useMockupSectionEditing(
  options: SectionEditingOptions,
): MockupSectionEditing {
  const naming = ref<SectionNaming>();
  const draft = ref("");
  const pickingIcon = ref<string>();
  const dragging = ref<SectionDrag>();
  const drop = ref<SectionDrop>();

  function startRename(category: EditedCategory): void {
    naming.value = { category: category.id };
    draft.value = category.title;
  }

  function commitName(): void {
    const at = naming.value;
    const title = draft.value.trim();
    naming.value = undefined;
    if (!at || !title) return;
    options.edit(
      at.category === undefined
        ? { kind: "addCategory", title }
        : { kind: "updateCategory", category: at.category, title },
    );
  }

  function overPage(event: DragEvent, section: number, item: number): void {
    const dragged = dragging.value;
    if (!dragged) return;
    event.preventDefault();
    if (dragged.kind === "section") {
      overSection(event, section);
      return;
    }
    drop.value = {
      kind: "page",
      section,
      index: item + (isLowerHalf(event) ? 1 : 0),
    };
  }

  function overSection(event: DragEvent, section: number): void {
    const dragged = dragging.value;
    if (!dragged) return;
    event.preventDefault();
    if (dragged.kind === "page") {
      const isKept =
        drop.value?.kind === "page" && drop.value.section === section;
      if (!isKept) drop.value = { kind: "page", section, index: 0 };
      return;
    }
    const index = Math.max(0, categoryIndex(section));
    drop.value = {
      kind: "section",
      index: section === 0 ? 0 : index + (isLowerHalf(event) ? 1 : 0),
    };
  }

  function endDrag(): void {
    dragging.value = undefined;
    drop.value = undefined;
  }

  function dropHere(event: DragEvent): void {
    const dragged = dragging.value;
    const at = drop.value;
    endDrag();
    if (!dragged || !at) return;
    event.preventDefault();
    const edit = dropEdit(options.sections(), dragged, at);
    if (edit) options.edit(edit);
  }

  return {
    naming,
    draft,
    pickingIcon,
    dragging,
    drop,
    isNaming: (category) =>
      naming.value !== undefined && naming.value.category === category,
    startNew: () => {
      naming.value = {};
      draft.value = "";
    },
    startRename,
    commitName,
    cancelName: () => {
      naming.value = undefined;
    },
    setIcon: (category, icon) =>
      options.edit({ kind: "updateCategory", category, icon }),
    menuContent: {
      onCloseAutoFocus: (event) => {
        if (naming.value !== undefined || pickingIcon.value !== undefined) {
          event.preventDefault();
        }
      },
    },
    menu: (category) =>
      sectionMenu(options.t, {
        rename: () => startRename(category),
        icon: () => {
          pickingIcon.value = category.id;
        },
        remove: () =>
          options.edit({ kind: "removeCategory", category: category.id }),
      }),
    startPageDrag: (event, page) => {
      dragging.value = { kind: "page", page };
      startDrag(event, page);
    },
    startSectionDrag: (event, category) => {
      dragging.value = { kind: "section", category };
      startDrag(event, category);
    },
    overPage,
    overSection,
    dropHere,
    endDrag,
    isDraggingSection: computed(() => dragging.value?.kind === "section"),
  };
}
