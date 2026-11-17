<script setup lang="ts">
import { ref } from "vue";
import { LOGO_INPUT_ACCEPT } from "./logos";

/** A logo slot's tile: click to pick a file; dashed while it shows the DMS's own. */
const props = defineProps<{
  label: string;
  icon: string;
  /** The file it shows, picked or saved; undefined for the DMS logo. */
  fileName?: string;
  emptyHint: string;
}>();

const emit = defineEmits<{ pick: [file: File]; remove: [] }>();

const { t } = useI18n();
const input = ref<HTMLInputElement | null>(null);

function onChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const file = target.files?.[0];
  target.value = "";
  if (file) emit("pick", file);
}
</script>

<template>
  <div
    class="group relative rounded-(--ui-radius) border text-center transition-colors hover:border-(--ui-border-accented)"
    :class="props.fileName ? 'border-default' : 'border-default border-dashed'"
  >
    <button
      type="button"
      class="flex w-full flex-col items-center gap-0.5 px-2 py-2.5"
      :aria-label="t('branding.logo.pick', { name: props.label })"
      @click="input?.click()"
    >
      <span
        class="text-highlighted flex items-center gap-1.5 text-sm font-semibold"
      >
        <UIcon :name="props.icon" class="size-3.5" />
        {{ props.label }}
      </span>
      <span class="text-muted max-w-full truncate text-xs">
        {{ props.fileName ?? props.emptyHint }}
      </span>
    </button>
    <UButton
      v-if="props.fileName"
      icon="i-ph-x-light"
      size="xs"
      color="neutral"
      variant="ghost"
      class="absolute end-0.5 top-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      :aria-label="t('branding.logo.remove', { name: props.label })"
      @click="emit('remove')"
    />
    <input
      ref="input"
      type="file"
      class="hidden"
      :accept="LOGO_INPUT_ACCEPT"
      @change="onChange"
    />
  </div>
</template>
