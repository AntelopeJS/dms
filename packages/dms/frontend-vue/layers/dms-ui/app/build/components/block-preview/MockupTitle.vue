<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from "vue";

/**
 * The mockup's title in the top bar. A click on it, or Enter on it once
 * focused, turns it into an input: Enter and a click away save, Escape puts
 * the title back, and an empty title is refused. The folder name is never
 * renamed here.
 */
const props = defineProps<{ title: string }>();
const emit = defineEmits<{ rename: [title: string] }>();

const MAX_TITLE_LENGTH = 120;

const { t } = useI18n();
const isEditing = ref(false);
const isRefused = ref(false);
const draft = ref("");
const field = useTemplateRef<HTMLElement>("field");
let isSettled = true;

async function start(): Promise<void> {
  draft.value = props.title;
  isRefused.value = false;
  isSettled = false;
  isEditing.value = true;
  await nextTick();
  const input = field.value?.querySelector("input");
  input?.focus();
  input?.select();
}

function save(): void {
  if (isSettled) return;
  const next = draft.value.trim();
  isRefused.value = next === "";
  if (isRefused.value) return;
  isSettled = true;
  isEditing.value = false;
  if (next !== props.title) emit("rename", next);
}

function cancel(): void {
  if (isSettled) return;
  isSettled = true;
  isEditing.value = false;
}

function onBlur(): void {
  if (draft.value.trim() === "") cancel();
  else save();
}
</script>

<template>
  <h1
    class="text-highlighted mx-1 min-w-0 text-sm font-semibold"
    data-dms-mockup-title
  >
    <span v-if="isEditing" ref="field" class="block">
      <UInput
        v-model="draft"
        size="sm"
        :maxlength="MAX_TITLE_LENGTH"
        :color="isRefused ? 'error' : 'neutral'"
        :aria-label="t('dms.mockup.rename_title')"
        :aria-invalid="isRefused"
        data-dms-mockup-title-input
        @keydown.enter.prevent="save"
        @keydown.esc.prevent="cancel"
        @blur="onBlur"
      />
    </span>
    <UTooltip v-else :text="t('dms.mockup.rename_title')">
      <button
        type="button"
        class="group hover:bg-elevated focus-visible:ring-primary -mx-1 flex max-w-72 items-center gap-1.5 rounded-md px-1 py-0.5 focus-visible:ring-2 focus-visible:outline-none"
        :aria-label="`${t('dms.mockup.rename_title')}: ${title}`"
        data-dms-mockup-title-edit
        @click="start"
      >
        <span class="truncate">{{ title }}</span>
        <UIcon
          name="i-ph-pencil-simple"
          class="text-muted size-3.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
    </UTooltip>
  </h1>
</template>
