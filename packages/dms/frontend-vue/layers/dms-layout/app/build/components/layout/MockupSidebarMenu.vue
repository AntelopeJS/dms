<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import MockupIconInput from "#dms-ui/app/entries/components/block-preview/MockupIconInput";
import {
  requestPreviewPage,
  requestSectionEdit,
} from "#dms-ui/app/entries/composables/block-preview/previewNavigation";
import { useMockupSectionEditing } from "#dms-ui/app/entries/composables/block-preview/useMockupSectionEditing";
import type { PreviewNavigation } from "#dms-ui/app/entries/utils/blockPreview";
import {
  mockupMenu,
  type MockupMenuPage,
  type MockupMenuSection,
} from "./mockupMenu";

/**
 * The sidebar's menu of a mockup: the spec's own sections and pages alone,
 * the default section under the real menu's Pages header, drawn by the
 * dashboard's own menu (see `mockupMenu`). Picking a page tells the embedding page, which draws it. While the navigation is
 * `editable`, the sections are edited in place, as in the viewer's page
 * list, and each change is handed to the embedding page, which writes the
 * spec; otherwise the menu only navigates.
 */
const props = defineProps<{
  navigation: PreviewNavigation;
  collapsed: boolean;
}>();
const openCategories = defineModel<string[]>("open", { required: true });

/** The ⋯ menu opens inside the section's header: drawn in the menu's own type, not the header's. */
const SECTION_MENU_UI = {
  content: "font-sans font-normal normal-case tracking-normal",
};
const DROP_LINE_CLASS =
  "bg-primary pointer-events-none absolute inset-x-0 h-0.5 rounded-full";

const { t } = useI18n();

const editing = useMockupSectionEditing({
  sections: () => props.navigation.sections,
  edit: requestSectionEdit,
  t,
});

const isEditable = computed(() => props.navigation.editable === true);

const menu = computed(() =>
  mockupMenu(props.navigation, {
    defaultSection: t("menu.section.pages"),
    select: requestPreviewPage,
  }),
);

function sectionOf(item: NavigationMenuItem): MockupMenuSection | undefined {
  const entry = menu.value.entries.get(String(item.id));
  return entry?.kind === "section" ? entry : undefined;
}

function pageOf(item: NavigationMenuItem): MockupMenuPage | undefined {
  const entry = menu.value.entries.get(String(item.id));
  return entry?.kind === "page" ? entry : undefined;
}

function isPageDropAt(section: number, index: number): boolean {
  const drop = editing.drop.value;
  return (
    drop?.kind === "page" && drop.section === section && drop.index === index
  );
}

function isSectionDropBefore(section: number): boolean {
  const drop = editing.drop.value;
  return drop?.kind === "section" && drop.index === section - 1;
}

/** Keeps a drop possible between rows, where the line stays where it was. */
function holdDrop(event: DragEvent): void {
  if (editing.dragging.value) event.preventDefault();
}
</script>

<template>
  <div @dragover="holdDrop" @drop="editing.dropHere" @dragend="editing.endDrag">
    <DmsNavigationMenu
      v-model="openCategories"
      :collapsed="collapsed"
      :items="menu.groups"
      orientation="vertical"
    >
      <template #mockup-section-label="{ item }">
        <template v-for="entry in [sectionOf(item)]" :key="entry?.section">
          <MockupIconInput
            v-if="
              entry?.category && editing.pickingIcon.value === entry.category.id
            "
            :model-value="entry.category.icon ?? ''"
            autofocus
            @update:model-value="
              entry.category && editing.setIcon(entry.category.id, $event)
            "
            @keydown.enter.prevent="editing.pickingIcon.value = undefined"
            @keydown.esc.prevent="editing.pickingIcon.value = undefined"
            @blur="editing.pickingIcon.value = undefined"
          />
          <UInput
            v-else-if="entry?.category && editing.isNaming(entry.category.id)"
            v-model="editing.draft.value"
            size="xs"
            class="w-full"
            autofocus
            :aria-label="t('dms.mockup.section_name')"
            @keydown.enter.prevent="editing.commitName"
            @keydown.esc.prevent="editing.cancelName"
            @blur="editing.commitName"
          />
          <span
            v-else-if="entry"
            class="relative block truncate"
            :draggable="isEditable && !!entry.category"
            :data-dms-preview-section="entry.category?.id ?? ''"
            data-dms-preview-section-title
            @dblclick="
              isEditable &&
              entry.category &&
              editing.startRename(entry.category)
            "
            @dragstart="
              entry.category &&
              editing.startSectionDrag($event, entry.category.id)
            "
            @dragover="editing.overSection($event, entry.section)"
          >
            <span
              v-if="isSectionDropBefore(entry.section)"
              :class="DROP_LINE_CLASS"
              class="-top-2"
              data-dms-preview-section-drop
            />
            {{ item.label }}
            <span
              v-if="entry.isEmpty && isPageDropAt(entry.section, 0)"
              :class="DROP_LINE_CLASS"
              class="-bottom-2"
              data-dms-preview-page-drop
            />
          </span>
        </template>
      </template>

      <template v-if="isEditable" #mockup-section-trailing="{ item }">
        <template v-for="entry in [sectionOf(item)]" :key="entry?.section">
          <UDropdownMenu
            v-if="entry?.category"
            :items="editing.menu(entry.category)"
            :content="editing.menuContent"
            :portal="false"
            :ui="SECTION_MENU_UI"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-ph-dots-three"
              class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              :aria-label="t('dms.mockup.section_actions')"
              data-dms-preview-section-menu
            />
          </UDropdownMenu>
        </template>
      </template>

      <template #mockup-page="{ item, active, ui }">
        <template v-for="entry in [pageOf(item)]" :key="entry?.page">
          <span
            v-if="entry"
            class="relative flex min-w-0 flex-1 items-center [gap:inherit]"
            :draggable="isEditable"
            @dragstart="editing.startPageDrag($event, entry.page)"
            @dragover.stop="
              editing.overPage($event, entry.section, entry.index)
            "
          >
            <span
              v-if="isPageDropAt(entry.section, entry.index)"
              :class="DROP_LINE_CLASS"
              class="-top-1.5"
              data-dms-preview-page-drop
            />
            <UIcon
              :name="item.icon"
              data-slot="linkLeadingIcon"
              :class="ui.linkLeadingIcon({ active, disabled: false })"
            />
            <span data-slot="linkLabel" :class="ui.linkLabel()">
              {{ item.label }}
            </span>
            <span
              v-if="
                entry.isLast && isPageDropAt(entry.section, entry.index + 1)
              "
              :class="DROP_LINE_CLASS"
              class="-bottom-1.5"
              data-dms-preview-page-drop
            />
          </span>
        </template>
      </template>
    </DmsNavigationMenu>

    <div v-if="isEditable && !collapsed" class="relative mt-1">
      <span
        v-if="isSectionDropBefore(navigation.sections.length)"
        :class="DROP_LINE_CLASS"
        class="-top-1"
        data-dms-preview-section-drop
      />
      <UInput
        v-if="editing.isNaming(undefined)"
        v-model="editing.draft.value"
        size="xs"
        autofocus
        :placeholder="t('dms.mockup.section_name')"
        :aria-label="t('dms.mockup.section_name')"
        data-dms-preview-section-new-name
        @keydown.enter.prevent="editing.commitName"
        @keydown.esc.prevent="editing.cancelName"
        @blur="editing.commitName"
      />
      <UButton
        v-else
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-ph-plus"
        data-dms-preview-section-new
        @click="editing.startNew"
      >
        {{ t("dms.mockup.section_new") }}
      </UButton>
    </div>
  </div>
</template>
