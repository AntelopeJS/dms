<script
  setup
  lang="ts"
  generic="
    T extends ArrayOrNested<SelectItem>,
    VK extends GetItemKeys<T> = 'value',
    M extends boolean = false
  "
>
import { useForwardPropsEmits } from "reka-ui";
import type {
  SelectProps,
  SelectEmits,
  SelectSlots,
  SelectItem,
} from "@nuxt/ui/components/Select.vue";
import type {
  ArrayOrNested,
  GetItemKeys,
} from "@nuxt/ui/runtime/types/utils.js";

type ColoredSelectItem = Extract<SelectItem, object> & {
  label?: string;
  icon?: string;
  iconColor?: string;
  textColor?: string;
};

interface ExtendedSelectProps extends SelectProps<T, VK, M> {
  deselectable?: boolean;
}

const props = withDefaults(defineProps<ExtendedSelectProps>(), {
  deselectable: true,
});
const emits = defineEmits<SelectEmits<T, VK, M>>();
defineSlots<SelectSlots<T, VK, M>>();

const forwardedProps = computed(() => {
  const { deselectable: _, modelValue: __, ...rest } = props;
  return rest;
});

const forwarded = useForwardPropsEmits(forwardedProps, emits);

const flattenedItems = computed<ColoredSelectItem[]>(() => {
  const items = (props.items ?? []) as unknown as
    | ColoredSelectItem[]
    | ColoredSelectItem[][];
  return Array.isArray(items[0])
    ? (items as ColoredSelectItem[][]).flat()
    : (items as ColoredSelectItem[]);
});

const selectedItem = computed<ColoredSelectItem | undefined>(() => {
  const value = props.modelValue;
  if (value === undefined || value === null) return undefined;
  const valueKey = (props.valueKey ?? "value") as keyof ColoredSelectItem;
  return flattenedItems.value.find(
    (item) => (item as Record<string, unknown>)[valueKey as string] === value,
  );
});

const colorVar = (color?: string) =>
  color ? { color: `var(--ui-${color})` } : undefined;

function handleUpdateModelValue(value: unknown) {
  const shouldDeselect =
    props.deselectable && !props.multiple && value === props.modelValue;
  (emits as (evt: "update:modelValue", value: unknown) => void)(
    "update:modelValue",
    shouldDeselect ? undefined : value,
  );
}
</script>

<template>
  <USelect
    v-bind="forwarded as Record<string, unknown>"
    :model-value="props.modelValue as SelectProps<T, VK, M>['modelValue']"
    @update:model-value="handleUpdateModelValue as (value: unknown) => void"
  >
    <template
      v-if="
        selectedItem &&
        (selectedItem.icon || selectedItem.iconColor || selectedItem.textColor)
      "
      #default
    >
      <span class="inline-flex items-center gap-1.5">
        <UIcon
          v-if="selectedItem.icon"
          :name="selectedItem.icon"
          class="size-4 shrink-0"
          :style="colorVar(selectedItem.iconColor)"
        />
        <span :style="colorVar(selectedItem.textColor)">
          {{ selectedItem.label }}
        </span>
      </span>
    </template>

    <template #item-leading="{ item }">
      <UIcon
        v-if="(item as ColoredSelectItem).icon"
        :name="(item as ColoredSelectItem).icon!"
        class="size-4 shrink-0"
        :style="colorVar((item as ColoredSelectItem).iconColor)"
      />
    </template>

    <template #item-label="{ item }">
      <span :style="colorVar((item as ColoredSelectItem).textColor)">
        {{ (item as ColoredSelectItem).label }}
      </span>
    </template>
  </USelect>
</template>
