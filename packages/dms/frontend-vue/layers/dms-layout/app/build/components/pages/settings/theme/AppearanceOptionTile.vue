<script setup lang="ts">
import { tv } from "tailwind-variants";

interface AppearanceOptionTileProps {
  /** Radio group name shared by the tiles of one choice. */
  name: string;
  value: string;
  label: string;
  hint?: string;
  icon?: string;
}

const props = defineProps<AppearanceOptionTileProps>();
const selected = defineModel<string>({ required: true });

// v2 .cs-tile: a preview on a muted tile; the chosen one lifts onto the card
// color with an accent border and halo.
const theme = tv({
  slots: {
    root: "group flex cursor-pointer flex-col gap-3 rounded-[10px] border p-2.5 pb-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/60",
    preview: "overflow-hidden rounded-md ring-1 ring-(--ui-border)",
    footer: "flex items-center gap-2.5 px-1",
    icon: "size-4 shrink-0 text-muted",
    text: "min-w-0 flex-1",
    label: "text-[13px] font-semibold text-highlighted",
    // Wraps rather than truncates: three tiles in the narrow lg settings
    // column cut every hint to a word.
    hint: "text-[12px] leading-snug text-pretty text-muted",
    radio:
      "grid size-4 shrink-0 place-items-center rounded-full ring-1 ring-inset ring-(--ui-border-accented)",
    radioDot: "size-1.5 rounded-full bg-(--dms-accent-on-fill)",
  },
  variants: {
    active: {
      true: {
        root: "border-primary bg-(--ui-bg) ring-[6px] ring-primary/10",
        icon: "text-primary",
        radio: "bg-(--dms-accent-fill) ring-(--dms-accent-fill)",
      },
      false: {
        root: "border-default bg-(--dms-bg-muted) hover:border-accented",
      },
    },
  },
});

const ui = computed(() => theme({ active: selected.value === props.value }));
const { processI18n } = useTranslation();
</script>

<template>
  <label :class="ui.root()">
    <input
      v-model="selected"
      type="radio"
      :name="props.name"
      :value="props.value"
      class="sr-only"
    />
    <div :class="ui.preview()">
      <slot name="preview" />
    </div>
    <div :class="ui.footer()">
      <UIcon v-if="props.icon" :name="props.icon" :class="ui.icon()" />
      <div :class="ui.text()">
        <div :class="ui.label()">{{ processI18n(props.label) }}</div>
        <div v-if="props.hint" :class="ui.hint()">
          {{ processI18n(props.hint) }}
        </div>
      </div>
      <span :class="ui.radio()" aria-hidden="true">
        <span v-if="selected === props.value" :class="ui.radioDot()" />
      </span>
    </div>
  </label>
</template>
