import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";
import { defineComponent, h, type PropType } from "vue";

interface PaletteInputProps {
  onKeydown?: (event: KeyboardEvent) => void;
}

function matchingItems(
  group: CommandPaletteGroup,
  term: string,
): CommandPaletteItem[] {
  const items = group.items ?? [];
  if (group.ignoreFilter || !term) return items;
  return items.filter((item) =>
    String(item.label).toLowerCase().includes(term.toLowerCase()),
  );
}

/**
 * Nuxt UI's filtering order: matched groups run their `postFilter` first, the
 * filter-ignoring groups after them, and a group left without items is dropped.
 */
function filterGroups(
  groups: CommandPaletteGroup[],
  term: string,
): CommandPaletteGroup[] {
  const ordered = [
    ...groups.filter((group) => !group.ignoreFilter),
    ...groups.filter((group) => group.ignoreFilter),
  ];
  return ordered
    .map((group) => {
      const items = matchingItems(group, term);
      if (!items.length) return { ...group, items: [] };
      return { ...group, items: group.postFilter?.(term, items) ?? items };
    })
    .filter((group) => group.items.length);
}

function selectEvent(): Event {
  return new Event("select", { cancelable: true });
}

function renderItem(group: CommandPaletteGroup, item: CommandPaletteItem) {
  return h(
    "button",
    {
      "data-group": group.id,
      onClick: () => item.onSelect?.(selectEvent()),
    },
    String(item.label),
  );
}

/** Renders the props and slots `DashboardSearch` hands `UDashboardSearch`. */
export const PaletteStub = defineComponent({
  props: {
    open: Boolean,
    colorMode: { type: Boolean, default: true },
    searchTerm: { type: String, default: "" },
    groups: {
      type: Array as PropType<CommandPaletteGroup[]>,
      default: () => [],
    },
    input: { type: Object as PropType<PaletteInputProps>, default: () => ({}) },
    icon: { type: String, default: undefined },
    placeholder: { type: String, default: undefined },
  },
  emits: ["update:open", "update:searchTerm"],
  setup(props, { slots, emit }) {
    return () => {
      const groups = filterGroups(props.groups, props.searchTerm);
      return h(
        "div",
        {
          role: "dialog",
          "data-open": String(props.open),
          "data-color-mode": String(props.colorMode),
        },
        [
          h("input", {
            value: props.searchTerm,
            placeholder: props.placeholder,
            "data-icon": props.icon,
            onKeydown: props.input.onKeydown,
            onInput: (event: Event) =>
              emit(
                "update:searchTerm",
                (event.target as HTMLInputElement).value,
              ),
          }),
          groups.length
            ? groups.flatMap((group) =>
                group.items!.map((item) => renderItem(group, item)),
              )
            : slots.empty?.(),
          slots.footer?.(),
        ],
      );
    };
  },
});
