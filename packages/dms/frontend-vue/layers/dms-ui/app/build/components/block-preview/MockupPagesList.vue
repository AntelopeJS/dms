<script setup lang="ts">
import { computed, ref } from "vue";
import type { MockupEdit } from "../../utils/mockupEdit";
import type { MockupSpecPage } from "../../utils/mockupSpec";

/**
 * The mockup's pages: open one, add, rename, reorder or remove them. The
 * first page is the mockup's home.
 */
const props = defineProps<{
  pages: readonly MockupSpecPage[];
  current: string | undefined;
}>();
const emit = defineEmits<{ open: [page: string]; edit: [edit: MockupEdit] }>();

const { t } = useI18n();
const renaming = ref<string>();
const draft = ref("");

function startRename(page: MockupSpecPage): void {
  renaming.value = page.id;
  draft.value = page.title;
}

function commitRename(): void {
  const page = renaming.value;
  const title = draft.value.trim();
  renaming.value = undefined;
  if (page && title) emit("edit", { kind: "updatePage", page, title });
}

function move(index: number, by: number): void {
  emit("edit", { kind: "movePage", from: index, to: index + by });
}

function addPage(): void {
  emit("edit", { kind: "addPage", title: t("dms.mockup.new_page_title") });
}

const isLast = computed(() => props.pages.length <= 1);
</script>

<template>
  <div class="space-y-2" data-dms-mockup-pages>
    <ul class="space-y-0.5">
      <li
        v-for="(page, index) in pages"
        :key="page.id"
        class="group flex items-center gap-1 rounded-md pe-1"
        :class="page.id === current ? 'bg-elevated' : 'hover:bg-elevated/60'"
        :data-dms-mockup-page-row="page.id"
      >
        <UInput
          v-if="renaming === page.id"
          v-model="draft"
          size="xs"
          class="min-w-0 flex-1"
          autofocus
          :aria-label="t('dms.mockup.page_title')"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="renaming = undefined"
          @blur="commitRename"
        />
        <button
          v-else
          type="button"
          class="text-default min-w-0 flex-1 truncate px-2 py-1.5 text-start text-sm"
          :aria-current="page.id === current ? 'page' : undefined"
          @click="emit('open', page.id)"
          @dblclick="startRename(page)"
        >
          {{ page.title }}
          <span v-if="index === 0" class="text-dimmed ms-1 text-xs">
            {{ t("dms.mockup.page_home") }}
          </span>
        </button>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-pencil-simple"
          :aria-label="t('dms.mockup.page_rename')"
          @click="startRename(page)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrow-up"
          :disabled="index === 0"
          :aria-label="t('dms.mockup.move_up')"
          @click="move(index, -1)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrow-down"
          :disabled="index === pages.length - 1"
          :aria-label="t('dms.mockup.move_down')"
          @click="move(index, 1)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-trash"
          :disabled="isLast"
          :aria-label="t('dms.mockup.page_remove')"
          @click="emit('edit', { kind: 'removePage', page: page.id })"
        />
      </li>
    </ul>
    <UButton
      size="sm"
      color="neutral"
      variant="ghost"
      icon="i-ph-plus"
      data-dms-mockup-add-page
      @click="addPage"
    >
      {{ t("dms.mockup.add_page") }}
    </UButton>
  </div>
</template>
