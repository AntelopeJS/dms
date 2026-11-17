import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";
import { defineComponent, h } from "vue";

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

function filterGroups(
  groups: CommandPaletteGroup[],
  term: string,
): CommandPaletteGroup[] {
  return groups
    .map((group) => ({ ...group, items: matchingItems(group, term) }))
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

interface PaletteProps {
  open: boolean;
  colorMode: boolean;
  searchTerm: string;
  groups: CommandPaletteGroup[];
  input: { onKeydown?: (event: KeyboardEvent) => void };
  icon: string | undefined;
  placeholder: string | undefined;
}

/** Renders the props and slots `DashboardSearch` hands `UDashboardSearch`. */
export const PaletteStub = defineComponent(
  (props: PaletteProps, { slots, emit }) => {
    return () => {
      const groups = filterGroups(props.groups, props.searchTerm);
      return h(
        "div",
        {
          role: "dialog",
          "data-open": String(props.open),
          "data-color-mode": String(props.colorMode),
          "data-empty-slot": String(!!slots.empty),
        },
        [
          h("input", {
            value: props.searchTerm,
            placeholder: props.placeholder,
            "data-icon": props.icon,
            onKeydown: props.input.onKeydown,
            onInput: (event: Event) => {
              if (event.target instanceof HTMLInputElement) {
                emit("update:searchTerm", event.target.value);
              }
            },
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
  {
    props: {
      open: Boolean,
      colorMode: { type: Boolean, default: true },
      searchTerm: { type: String, default: "" },
      groups: { type: Array, default: () => [] },
      input: { type: Object, default: () => ({}) },
      icon: { type: String, default: undefined },
      placeholder: { type: String, default: undefined },
    },
    emits: ["update:open", "update:searchTerm"],
  },
);
