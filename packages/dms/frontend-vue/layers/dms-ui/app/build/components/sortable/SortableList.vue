<script setup lang="ts" generic="Item">
/**
 * A list whose items the user reorders by dragging, or moves to another list
 * of the same `group`: SortableJS, through VueUse's `useSortable`.
 *
 * SortableJS moves the dragged element in the DOM itself. Vue owns these
 * elements, so each drop puts the element back where it was and updates the
 * `list` model with a new array instead, from which Vue renders the new
 * order. `change` then says what happened to this list: `moved` within it,
 * `added` from another one, `removed` to another one.
 */
import { useSortable } from "@vueuse/integrations/useSortable";
import { ref, watch } from "vue";

export interface SortableListChange<Item> {
  added?: { element: Item; newIndex: number };
  removed?: { element: Item; oldIndex: number };
  moved?: { element: Item; oldIndex: number; newIndex: number };
}

/** The items, in order: a new array after each drop. */
const list = defineModel<Item[]>("list", { required: true });

const props = defineProps<{
  /** A stable key of an item: Vue keeps each element with its item. */
  itemKey: (item: Item) => PropertyKey | undefined;
  /** Lists sharing a group exchange items. */
  group?: string;
  disabled?: boolean;
  /** Only an item grabbed by an element matching this selector moves. */
  handle?: string;
  /** Items matching this selector stay in place. */
  filter?: string;
  /** Class of the slot the dragged item will land in. */
  ghostClass?: string;
  /** Class of the item while it follows the pointer. */
  dragClass?: string;
}>();

const emit = defineEmits<{ change: [change: SortableListChange<Item>] }>();

defineSlots<{
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Vue's Slot return type narrows this existing consumer-provided slot contract; preserve the unrestricted return annotation.
  item(props: { element: Item; index: number }): unknown;
}>();

/** What this list reads of SortableJS's events. */
interface SortableEvent {
  item: HTMLElement;
  oldIndex?: number;
  newIndex?: number;
}

const draggedKey = () => props.group ?? "";

const root = ref<HTMLElement | null>(null);

/**
 * Where the dragged element stood. Next to the node that followed it, not at
 * an index: Vue removes an item by the markers around it, which an index
 * among the elements does not see.
 */
let origin: { parent: Node; next: Node | null } | undefined;

/** Put the element SortableJS moved back where Vue rendered it. */
function restore(item: HTMLElement) {
  if (origin) origin.parent.insertBefore(item, origin.next);
}

/** `list` without its item at `index`, and that item. */
function without(index: number): [Item[], Item | undefined] {
  const next = [...list.value];
  const [element] = next.splice(index, 1);
  return [next, element];
}

const { option } = useSortable(root, list, {
  group: props.group,
  disabled: props.disabled,
  handle: props.handle,
  filter: props.filter,

  preventOnFilter: false,
  ghostClass: props.ghostClass,
  dragClass: props.dragClass,
  onStart: (event: SortableEvent) => {
    const { parentNode, nextSibling } = event.item;
    origin = parentNode ? { parent: parentNode, next: nextSibling } : undefined;
    const element = list.value[event.oldIndex ?? -1];
    if (element !== undefined) sharedDragged.set(draggedKey(), element);
  },
  onUpdate: (event: SortableEvent) => {
    const { oldIndex, newIndex } = event;
    if (oldIndex === undefined || newIndex === undefined) return;
    restore(event.item);
    const [next, element] = without(oldIndex);
    if (element === undefined) return;
    next.splice(newIndex, 0, element);
    list.value = next;
    emit("change", { moved: { element, oldIndex, newIndex } });
  },
  onAdd: (event: SortableEvent) => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- A group can join independently typed lists; this existing cast does not validate the source item's type.
    const element = sharedDragged.get(draggedKey()) as Item | undefined;
    const { newIndex } = event;
    if (element === undefined || newIndex === undefined) return;

    event.item.remove();
    const next = [...list.value];
    next.splice(newIndex, 0, element);
    list.value = next;
    emit("change", { added: { element, newIndex } });
  },
  onRemove: (event: SortableEvent) => {
    const { oldIndex } = event;
    if (oldIndex === undefined) return;
    restore(event.item);
    const [next, element] = without(oldIndex);
    if (element === undefined) return;
    list.value = next;
    emit("change", { removed: { element, oldIndex } });
  },
  onEnd: () => {
    origin = undefined;
    sharedDragged.delete(draggedKey());
  },
});

watch(
  () => props.disabled,
  (disabled) => option("disabled", disabled),
);
</script>

<script lang="ts">
const sharedDragged = new Map<string, unknown>();
</script>

<template>
  <div ref="root">
    <template v-for="(element, index) in list" :key="itemKey(element)">
      <slot name="item" :element="element" :index="index" />
    </template>
  </div>
</template>
