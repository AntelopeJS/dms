<script setup lang="ts">
import { computed, ref } from "vue";
import { useMockupSectionEditing } from "../../composables/block-preview/useMockupSectionEditing";
import type { MockupCategory } from "../../utils/mockup";
import type { MockupEdit } from "../../utils/mockupEdit";
import {
  groupSections,
  pageCategory,
  type MockupSectionEdit,
} from "../../utils/mockupSections";
import {
  isHiddenPage,
  pageForest,
  SPEC_PAGE_KEYS,
  topMoveIndex,
} from "../../utils/mockupPageTree";
import type { MockupSpecPage } from "../../utils/mockupSpec";
import MockupIconInput from "./MockupIconInput.vue";

/**
 * The mockup's pages under their sections: open one, add, rename, reorder or
 * remove pages, and add, rename, give an icon to, reorder or delete the
 * sections, a page or a section dragged into place. The first page is the
 * mockup's home. A sub-page is listed under its parent, and moves with it; a
 * page the sidebar leaves out is marked hidden.
 */
const props = defineProps<{
  pages: readonly MockupSpecPage[];
  categories: readonly MockupCategory[];
  current: string | undefined;
}>();
const emit = defineEmits<{
  open: [page: string];
  edit: [edit: MockupEdit];
  section: [edit: MockupSectionEdit];
}>();

const { t } = useI18n();
const renaming = ref<string>();
const draft = ref("");

const forest = computed(() => pageForest(props.pages, SPEC_PAGE_KEYS));
const sections = computed(() =>
  groupSections(props.categories, forest.value.roots, pageCategory).map(
    (section) => ({ ...section, items: section.pages }),
  ),
);

/** A move among the top pages a section lists, written as a move among all its pages. */
function writeSection(edit: MockupSectionEdit): void {
  if (edit.kind !== "movePageTo") {
    emit("section", edit);
    return;
  }
  const others =
    groupSections(
      props.categories,
      props.pages.filter((page) => page.id !== edit.page),
      pageCategory,
    ).find((section) => (section.category?.id ?? null) === edit.category)
      ?.pages ?? [];
  const roots = others.filter((page) => forest.value.roots.includes(page));
  emit("section", { ...edit, index: topMoveIndex(others, roots, edit.index) });
}
const hasCategories = computed(() => props.categories.length > 0);
const home = computed(() => props.pages[0]?.id);

const editing = useMockupSectionEditing({
  sections: () => sections.value,
  edit: writeSection,
  t,
});

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

/** Moves the page by one place within its section. */
function move(page: string, category: string | null, index: number): void {
  writeSection({ kind: "movePageTo", page, category, index });
}

function addPage(): void {
  emit("edit", { kind: "addPage", title: t("dms.mockup.new_page_title") });
}

function isPageDropAt(section: number, index: number): boolean {
  const drop = editing.drop.value;
  return (
    drop?.kind === "page" && drop.section === section && drop.index === index
  );
}

function isSectionDropAt(category: number): boolean {
  const drop = editing.drop.value;
  return drop?.kind === "section" && drop.index === category;
}

const isLast = computed(() => props.pages.length <= 1);
</script>

<template>
  <div class="space-y-3" data-dms-mockup-pages @dragend="editing.endDrag">
    <section
      v-for="(section, index) in sections"
      :key="section.category?.id ?? ''"
      class="space-y-0.5"
      :data-dms-mockup-section="section.category?.id ?? ''"
      @dragover="editing.overSection($event, index)"
      @drop="editing.dropHere"
    >
      <div
        v-if="isSectionDropAt(index - 1)"
        class="bg-primary h-0.5 rounded-full"
        data-dms-mockup-section-drop
      />
      <div
        v-if="section.category || hasCategories"
        class="group flex min-h-7 items-center gap-1 pe-1"
        :draggable="!!section.category"
        :data-dms-mockup-section-header="section.category?.id ?? ''"
        @dragstart="
          section.category &&
          editing.startSectionDrag($event, section.category.id)
        "
      >
        <UInput
          v-if="section.category && editing.isNaming(section.category.id)"
          v-model="editing.draft.value"
          size="xs"
          class="min-w-0 flex-1"
          autofocus
          :aria-label="t('dms.mockup.section_name')"
          data-dms-mockup-section-name
          @keydown.enter.prevent="editing.commitName"
          @keydown.esc.prevent="editing.cancelName"
          @blur="editing.commitName"
        />
        <template v-else>
          <UIcon
            v-if="section.category?.icon"
            :name="section.category.icon"
            class="text-dimmed ms-2 size-3.5 shrink-0"
          />
          <span
            class="text-dimmed min-w-0 flex-1 truncate px-2 text-xs font-semibold tracking-wide uppercase"
            data-dms-mockup-section-title
            @dblclick="
              section.category && editing.startRename(section.category)
            "
          >
            {{ section.category?.title ?? t("dms.mockup.section_default") }}
          </span>
          <UDropdownMenu
            v-if="section.category"
            :items="editing.menu(section.category)"
            :content="editing.menuContent"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-ph-dots-three"
              :aria-label="t('dms.mockup.section_actions')"
              data-dms-mockup-section-menu
            />
          </UDropdownMenu>
        </template>
      </div>
      <div
        v-if="
          section.category && editing.pickingIcon.value === section.category.id
        "
        class="px-1 pb-1"
      >
        <MockupIconInput
          :model-value="section.category.icon ?? ''"
          autofocus
          data-dms-mockup-section-icon
          @update:model-value="
            section.category && editing.setIcon(section.category.id, $event)
          "
          @keydown.enter.prevent="editing.pickingIcon.value = undefined"
          @keydown.esc.prevent="editing.pickingIcon.value = undefined"
          @blur="editing.pickingIcon.value = undefined"
        />
      </div>
      <ul class="space-y-0.5">
        <li
          v-for="(page, at) in section.pages"
          :key="page.id"
          draggable="true"
          @dragstart="editing.startPageDrag($event, page.id)"
          @dragover.stop="editing.overPage($event, index, at)"
        >
          <div
            v-if="isPageDropAt(index, at)"
            class="bg-primary h-0.5 rounded-full"
            data-dms-mockup-page-drop
          />
          <div
            class="group flex items-center gap-1 rounded-md pe-1"
            :class="
              page.id === current ? 'bg-elevated' : 'hover:bg-elevated/60'
            "
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
              <span v-if="page.id === home" class="text-dimmed ms-1 text-xs">
                {{ t("dms.mockup.page_home") }}
              </span>
              <UIcon
                v-if="isHiddenPage(page)"
                name="i-ph-eye-slash"
                class="text-dimmed ms-1 inline-block size-3.5 align-[-2px]"
                :aria-label="t('dms.mockup.page_hidden')"
                data-dms-mockup-page-hidden
              />
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
              :disabled="at === 0"
              :aria-label="t('dms.mockup.move_up')"
              @click="move(page.id, section.category?.id ?? null, at - 1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-ph-arrow-down"
              :disabled="at === section.pages.length - 1"
              :aria-label="t('dms.mockup.move_down')"
              @click="move(page.id, section.category?.id ?? null, at + 1)"
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
          </div>
          <ul class="space-y-0.5">
            <li
              v-for="child in forest.descendants(page.id)"
              :key="child.page.id"
              class="group flex items-center gap-1 rounded-md pe-1"
              :class="
                child.page.id === current
                  ? 'bg-elevated'
                  : 'hover:bg-elevated/60'
              "
              :style="{ paddingInlineStart: `${child.depth * 0.75}rem` }"
              :data-dms-mockup-page-row="child.page.id"
              :data-dms-mockup-page-parent="page.id"
            >
              <UIcon
                name="i-ph-arrow-elbow-down-right"
                class="text-dimmed size-3.5 shrink-0"
              />
              <UInput
                v-if="renaming === child.page.id"
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
                class="text-default min-w-0 flex-1 truncate px-1 py-1.5 text-start text-sm"
                :aria-current="child.page.id === current ? 'page' : undefined"
                @click="emit('open', child.page.id)"
                @dblclick="startRename(child.page)"
              >
                {{ child.page.title }}
                <UIcon
                  v-if="isHiddenPage(child.page)"
                  name="i-ph-eye-slash"
                  class="text-dimmed ms-1 inline-block size-3.5 align-[-2px]"
                  :aria-label="t('dms.mockup.page_hidden')"
                  data-dms-mockup-page-hidden
                />
              </button>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-ph-pencil-simple"
                :aria-label="t('dms.mockup.page_rename')"
                @click="startRename(child.page)"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-ph-trash"
                :aria-label="t('dms.mockup.page_remove')"
                @click="
                  emit('edit', { kind: 'removePage', page: child.page.id })
                "
              />
            </li>
          </ul>
        </li>
        <li
          v-if="isPageDropAt(index, section.pages.length)"
          class="bg-primary h-0.5 rounded-full"
          data-dms-mockup-page-drop
        />
      </ul>
    </section>
    <div
      v-if="isSectionDropAt(categories.length)"
      class="bg-primary h-0.5 rounded-full"
      data-dms-mockup-section-drop
    />
    <div class="flex flex-wrap items-center gap-1">
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
      <UInput
        v-if="editing.isNaming(undefined)"
        v-model="editing.draft.value"
        size="xs"
        autofocus
        :placeholder="t('dms.mockup.section_name')"
        :aria-label="t('dms.mockup.section_name')"
        data-dms-mockup-section-new-name
        @keydown.enter.prevent="editing.commitName"
        @keydown.esc.prevent="editing.cancelName"
        @blur="editing.commitName"
      />
      <UButton
        v-else
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-ph-plus"
        data-dms-mockup-section-new
        @click="editing.startNew"
      >
        {{ t("dms.mockup.section_new") }}
      </UButton>
    </div>
  </div>
</template>
