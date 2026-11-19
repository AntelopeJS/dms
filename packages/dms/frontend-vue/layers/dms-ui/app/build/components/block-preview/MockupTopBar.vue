<script setup lang="ts">
import type {
  MockupPanelSide,
  MockupPanelsOpen,
} from "../../composables/block-preview/useMockupPanels";
import { MOCKUP_WIDTH_OPTIONS, type MockupWidth } from "../../utils/mockup";
import MockupShortcutTip from "./MockupShortcutTip.vue";
import MockupTitle from "./MockupTitle.vue";

const WIDTH_ICONS: Record<MockupWidth, string> = {
  desktop: "i-ph-desktop",
  mobile: "i-ph-device-mobile",
};

const MOCKUPS_PATH = "/mockups";

/**
 * The `/mockup` toolbar: back to the mockups, the mockup's title (renamed in
 * place by a click), the left panel, undo and redo, the Comment tool, the
 * version history, Real data when the page names live routes, the frame
 * width, the shortcuts sheet, "Build it", which reads "Building… ↗" while the
 * assistant builds the mockup, and the right panel. In the Overview, the
 * mockup's home, which edits nothing and draws every page at the desktop
 * width, the panels and Preview are off and Real data and the width are
 * gone. ▶ Preview hands every click to the page, as the dashboard runs it:
 * the panels, the Comment tool, undo and redo are off meanwhile.
 */
defineProps<{
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  issueCount: number;
  isConnected: boolean;
  /** Whether the page has live routes to read: the Real data switch shows only then. */
  hasRealData: boolean;
  panels: MockupPanelsOpen;
  /** Whether the version history panel is open. */
  isHistoryOpen: boolean;
  /** Whether the Overview is on screen in place of a page. */
  isOverview: boolean;
  /** Whether the assistant builds the mockup now: "Build it" then leads to its conversation. */
  isBuilding: boolean;
}>();
const width = defineModel<MockupWidth>("width", { required: true });
const realData = defineModel<boolean>("realData", { required: true });
const isPlacing = defineModel<boolean>("placing", { required: true });
const isPreviewing = defineModel<boolean>("previewing", { required: true });
const emit = defineEmits<{
  undo: [];
  redo: [];
  build: [];
  panel: [side: MockupPanelSide];
  rename: [title: string];
  shortcuts: [];
  history: [];
}>();

const { t } = useI18n();
</script>

<template>
  <header
    class="border-default bg-default flex flex-wrap items-center gap-2 border-b px-3 py-2"
    data-dms-mockup-topbar
  >
    <MockupShortcutTip :label="t('dms.mockup.back_hint')">
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-ph-arrow-left"
        :to="MOCKUPS_PATH"
        data-dms-mockup-back
      >
        {{ t("dms.mockup.back") }}
      </UButton>
    </MockupShortcutTip>
    <MockupShortcutTip
      :label="t('dms.mockup.edit_panel')"
      shortcut="left_panel"
    >
      <UButton
        size="sm"
        color="neutral"
        :variant="panels.left && !isOverview ? 'soft' : 'ghost'"
        icon="i-ph-sidebar-simple"
        :disabled="isOverview"
        :aria-label="t('dms.mockup.edit_panel')"
        :aria-pressed="panels.left"
        data-dms-mockup-panel-toggle="left"
        @click="emit('panel', 'left')"
      />
    </MockupShortcutTip>
    <MockupTitle :title="title" @rename="emit('rename', $event)" />
    <UBadge
      :color="issueCount ? 'warning' : 'success'"
      variant="subtle"
      size="sm"
      data-dms-mockup-issue-count
    >
      {{ t("dms.mockup.issues", { count: issueCount }) }}
    </UBadge>
    <span
      v-if="!isConnected"
      class="text-muted text-xs"
      data-dms-mockup-disconnected
    >
      {{ t("dms.mockup.disconnected") }}
    </span>
    <div class="ms-auto flex flex-wrap items-center gap-2">
      <div class="flex gap-0.5">
        <MockupShortcutTip :label="t('dms.mockup.undo')" shortcut="undo">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-ph-arrow-counter-clockwise"
            :disabled="!canUndo"
            :aria-label="t('dms.mockup.undo')"
            data-dms-mockup-undo
            @click="emit('undo')"
          />
        </MockupShortcutTip>
        <MockupShortcutTip :label="t('dms.mockup.redo')" shortcut="redo">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-ph-arrow-clockwise"
            :disabled="!canRedo"
            :aria-label="t('dms.mockup.redo')"
            data-dms-mockup-redo
            @click="emit('redo')"
          />
        </MockupShortcutTip>
      </div>
      <div class="flex gap-0.5">
        <MockupShortcutTip
          :label="t('dms.mockup.preview_hint')"
          shortcut="preview"
        >
          <UButton
            size="sm"
            color="neutral"
            :variant="isPreviewing ? 'soft' : 'ghost'"
            icon="i-ph-play"
            :disabled="isOverview"
            :aria-pressed="isPreviewing"
            data-dms-mockup-preview-toggle
            @click="isPreviewing = !isPreviewing"
          >
            {{ t("dms.mockup.preview") }}
          </UButton>
        </MockupShortcutTip>
        <MockupShortcutTip
          :label="t('dms.mockup.comment_hint')"
          shortcut="comment"
        >
          <UButton
            size="sm"
            color="neutral"
            :variant="isPlacing ? 'soft' : 'ghost'"
            icon="i-ph-chat-circle-dots"
            :disabled="isPreviewing"
            :aria-pressed="isPlacing"
            data-dms-mockup-comment
            @click="isPlacing = !isPlacing"
          >
            {{ t("dms.mockup.comment") }}
          </UButton>
        </MockupShortcutTip>
      </div>
      <MockupShortcutTip :label="t('dms.mockup.history_hint')">
        <UButton
          size="sm"
          color="neutral"
          :variant="isHistoryOpen ? 'soft' : 'ghost'"
          icon="i-ph-clock-counter-clockwise"
          :aria-pressed="isHistoryOpen"
          data-dms-mockup-history
          @click="emit('history')"
        >
          {{ t("dms.mockup.history") }}
        </UButton>
      </MockupShortcutTip>
      <MockupShortcutTip
        v-if="hasRealData"
        :label="t('dms.mockup.real_data_hint')"
      >
        <USwitch
          v-model="realData"
          size="sm"
          :label="t('dms.mockup.real_data')"
          data-dms-mockup-real-data
        />
      </MockupShortcutTip>
      <div
        v-if="!isOverview"
        class="border-default flex gap-0.5 rounded-md border p-0.5"
        role="group"
        :aria-label="t('dms.mockup.width')"
      >
        <MockupShortcutTip
          v-for="option in MOCKUP_WIDTH_OPTIONS"
          :key="option"
          :label="t(`dms.mockup.width_${option}`)"
        >
          <UButton
            size="xs"
            color="neutral"
            :variant="option === width ? 'soft' : 'ghost'"
            :icon="WIDTH_ICONS[option]"
            :aria-label="t(`dms.mockup.width_${option}`)"
            :aria-pressed="option === width"
            data-dms-mockup-width
            @click="width = option"
          />
        </MockupShortcutTip>
      </div>
      <MockupShortcutTip
        :label="t('dms.mockup.shortcuts_title')"
        shortcut="shortcuts"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-ph-keyboard"
          :aria-label="t('dms.mockup.shortcuts_title')"
          data-dms-mockup-shortcuts-open
          @click="emit('shortcuts')"
        />
      </MockupShortcutTip>
      <MockupShortcutTip
        :label="t(isBuilding ? 'dms.mockup.run_hint' : 'dms.mockup.build_hint')"
      >
        <UButton
          size="sm"
          color="primary"
          icon="i-ph-hammer"
          data-dms-mockup-build
          @click="emit('build')"
        >
          {{ t(isBuilding ? "dms.mockup.build_running" : "dms.mockup.build") }}
        </UButton>
      </MockupShortcutTip>
      <MockupShortcutTip
        :label="t('dms.mockup.inspector')"
        shortcut="right_panel"
      >
        <UButton
          size="sm"
          color="neutral"
          :variant="panels.right && !isOverview ? 'soft' : 'ghost'"
          icon="i-ph-sidebar-simple"
          class="-scale-x-100"
          :disabled="isOverview"
          :aria-label="t('dms.mockup.inspector')"
          :aria-pressed="panels.right"
          data-dms-mockup-panel-toggle="right"
          @click="emit('panel', 'right')"
        />
      </MockupShortcutTip>
    </div>
  </header>
</template>
