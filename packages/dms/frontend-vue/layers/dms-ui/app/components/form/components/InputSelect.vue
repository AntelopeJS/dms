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
import { FIELD_TRIGGER_ICON } from "../../../build/utils/fieldTrigger";
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

export interface ExtendedSelectProps<
  T extends ArrayOrNested<SelectItem>,
  VK extends GetItemKeys<T> = "value",
  M extends boolean = false,
> extends SelectProps<T, VK, M> {
  deselectable?: boolean;
}

type ColoredSelectItem = Extract<SelectItem, object> & {
  label?: string;
  icon?: string;
  iconColor?: string;
  textColor?: string;
};

type SelectModelValue = SelectEmits<T, VK, M>["update:modelValue"][0];

const props = withDefaults(defineProps<ExtendedSelectProps<T, VK, M>>(), {
  deselectable: true,
});
const emits = defineEmits<
  Omit<SelectEmits<T, VK, M>, "update:modelValue"> & {
    /** The pick, or `undefined` when the pick is picked again and undone. */
    "update:modelValue": [value: SelectModelValue | undefined];
  }
>();
defineSlots<SelectSlots<T, VK, M>>();

const forwardedProps = computed(() => {
  const { deselectable: _, modelValue: __, ...rest } = props;
  return rest;
});

const forwarded = useForwardPropsEmits(forwardedProps, emits);

const flattenedItems = computed<ColoredSelectItem[]>(() => {
  const items: ArrayOrNested<SelectItem> = props.items ?? [];
  return items
    .flat()
    .filter((item) => typeof item === "object" && item !== null);
});

const selectedItem = computed<ColoredSelectItem | undefined>(() => {
  const value = props.modelValue;
  if (value === undefined || value === null) return undefined;
  const valueKey = props.valueKey ?? "value";
  return flattenedItems.value.find((item) => item[valueKey] === value);
});

const colorVar = (color?: string) =>
  color ? { color: `var(--ui-${color})` } : undefined;

function handleUpdateModelValue(value: SelectModelValue) {
  const shouldDeselect =
    props.deselectable && !props.multiple && value === props.modelValue;
  emits("update:modelValue", shouldDeselect ? undefined : value);
}
</script>

<template>
  <USelect
    v-bind="forwarded"
    :trailing-icon="props.trailingIcon ?? FIELD_TRIGGER_ICON"
    :model-value="props.modelValue"
    @update:model-value="handleUpdateModelValue"
  >
    <template
      v-if="
        selectedItem &&
        (selectedItem.icon || selectedItem.iconColor || selectedItem.textColor)
      "
      #default
    >
      <!-- Top-aligned: on the text's baseline, the icon would add the
        line's descent and make the trigger taller than a text field. -->
      <span class="inline-flex max-w-full items-center gap-1.5 align-top">
        <UIcon
          v-if="selectedItem.icon"
          :name="selectedItem.icon"
          class="size-4 shrink-0"
          :style="colorVar(selectedItem.iconColor)"
        />
        <span class="truncate" :style="colorVar(selectedItem.textColor)">
          {{ selectedItem.label }}
        </span>
      </span>
    </template>

    <template #item-leading="{ item }">
      <UIcon
        v-if="item.icon"
        :name="item.icon!"
        class="size-4 shrink-0"
        :style="colorVar(item.iconColor)"
      />
    </template>

    <template #item-label="{ item }">
      <span :style="colorVar(item.textColor)">
        {{ item.label }}
      </span>
    </template>
  </USelect>
</template>
