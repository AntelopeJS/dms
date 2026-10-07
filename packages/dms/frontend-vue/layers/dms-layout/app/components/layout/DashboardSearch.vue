<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from "vue";
import CommandPaletteAssistantAnswer from "../../build/components/layout/CommandPaletteAssistantAnswer.vue";
import { ASSISTANT_MODE_KEY } from "../../build/composables/command-palette/assistantGroups";
import { useCommandPaletteAssistantMode } from "../../build/composables/command-palette/useCommandPaletteAssistantMode";

const { t } = useI18n();
const appConfig = useDmsAppConfig();
const { groups: sourceGroups } = useCommandPaletteGroups();
const fuse = COMMAND_PALETTE_FUSE_OPTIONS;
const {
  isOpen,
  searchTerm,
  assistant,
  isAssistantMode,
  answer,
  groups,
  announcement,
  setMode,
  onInputKeydown,
} = useCommandPaletteAssistantMode(sourceGroups);

const footerRef = useTemplateRef<HTMLElement>("footer");
const input = { onKeydown: onInputKeydown };
// The halo eases between the accent ring and the violet assistant ring.
const MODAL_TRANSITION_CLASS = "transition-shadow duration-300";
// With an assistant, the empty slot holds the DMS's own padded states.
const ASSISTANT_EMPTY_CLASS = "p-0 text-start";
const SEARCH_UI = { modal: MODAL_TRANSITION_CLASS };
const SEARCH_WITH_ASSISTANT_UI = {
  ...SEARCH_UI,
  empty: ASSISTANT_EMPTY_CLASS,
};
const ASSISTANT_UI = {
  modal: `${MODAL_TRANSITION_CLASS} shadow-[var(--dms-shadow-cmdk),var(--dms-halo-ai)]`,
  input: "[&_input]:caret-secondary [&_[data-slot=leadingIcon]]:text-secondary",
  empty: ASSISTANT_EMPTY_CLASS,
};

const paletteUi = computed(() => {
  if (!assistant.value) return SEARCH_UI;
  return isAssistantMode.value ? ASSISTANT_UI : SEARCH_WITH_ASSISTANT_UI;
});
const query = computed(() => searchTerm.value.trim());

/** Brings focus back to the prompt after the control that held it goes away. */
async function focusInput(): Promise<void> {
  await nextTick();
  footerRef.value
    ?.closest('[role="dialog"]')
    ?.querySelector<HTMLInputElement>("input")
    ?.focus();
}

function switchMode(): void {
  setMode(isAssistantMode.value ? "search" : "assistant");
  void focusInput();
}

function close(): void {
  isOpen.value = false;
}
</script>

<template>
  <!-- Nuxt UI ships no `dashboardSearch.title` / `.description` message, so
       leaving these props out exposes those raw keys as the dialog's
       accessible name. -->
  <UDashboardSearch
    v-model:open="isOpen"
    v-model:search-term="searchTerm"
    :groups="groups"
    :fuse="fuse"
    :color-mode="!isAssistantMode"
    :input="input"
    :icon="isAssistantMode ? assistant?.icon : undefined"
    :placeholder="isAssistantMode ? assistant?.placeholder : undefined"
    :ui="paletteUi"
    :title="t('commandPalette.dialog.title')"
    :description="t('commandPalette.dialog.description')"
  >
    <!-- The input's trailing slot: the assistant scope chip, then the close
         button the slot replaces. -->
    <template v-if="assistant" #close="{ ui }">
      <span
        v-if="isAssistantMode"
        class="text-secondary inline-flex h-6.5 shrink-0 items-center rounded-[7px] bg-(--dms-ai-tint) px-2 text-xs font-semibold whitespace-nowrap"
      >
        {{ assistant.label }}
      </span>
      <UButton
        :icon="appConfig.ui.icons.close"
        color="neutral"
        variant="ghost"
        :aria-label="t('commandPalette.footer.close')"
        :class="ui.close()"
        @click="close"
      />
    </template>

    <template v-if="assistant" #empty>
      <CommandPaletteAssistantAnswer
        v-if="answer"
        :key="answer.id"
        :label="assistant.label"
        :icon="assistant.icon"
        :component="assistant.answerComponent"
        :prompt="answer.prompt"
        :close="close"
      />
      <div
        v-else-if="!isAssistantMode && query"
        class="text-muted grid justify-items-center gap-1.5 px-6 pt-9 pb-7 text-center text-sm"
      >
        <UIcon
          :name="appConfig.ui.icons.search"
          class="text-dimmed mb-1.5 size-6.5"
        />
        <strong class="text-highlighted text-[13.5px] font-semibold">
          {{ t("commandPalette.assistant.noResults", { query }) }}
        </strong>
        <span>{{ t("commandPalette.assistant.noResultsHint") }}</span>
        <UButton
          class="mt-3"
          color="secondary"
          variant="soft"
          size="sm"
          :icon="assistant.icon"
          @mousedown.prevent
          @click="switchMode"
        >
          {{ t("commandPalette.assistant.askShort") }}
          <UKbd :value="ASSISTANT_MODE_KEY" size="sm" />
        </UButton>
      </div>
      <p
        v-else-if="isAssistantMode"
        class="text-muted px-6 py-8 text-center text-sm"
      >
        {{ t("commandPalette.assistant.emptyPrompt") }}
      </p>
    </template>

    <!-- v2 footer band: the keys that drive the palette. -->
    <template #footer>
      <span ref="footer" class="sr-only" aria-live="polite">
        {{ announcement }}
      </span>
      <span v-if="isAssistantMode" class="inline-flex items-center gap-1.5">
        <UKbd value="↵" size="sm" />
        {{ t("commandPalette.footer.send") }}
      </span>
      <template v-else>
        <span class="inline-flex items-center gap-1.5">
          <UKbd value="↑" size="sm" />
          <UKbd value="↓" size="sm" />
          {{ t("commandPalette.footer.navigate") }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <UKbd value="↵" size="sm" />
          {{ t("commandPalette.footer.open") }}
        </span>
      </template>
      <span class="inline-flex items-center gap-1.5">
        <UKbd value="Esc" size="sm" />
        {{ t("commandPalette.footer.close") }}
      </span>
      <UButton
        v-if="assistant"
        class="text-muted hover:text-secondary ms-auto gap-1.5 px-2 py-0.5 text-xs hover:bg-(--dms-ai-tint)"
        color="neutral"
        variant="ghost"
        size="xs"
        :icon="isAssistantMode ? appConfig.ui.icons.search : assistant.icon"
        :ui="{ leadingIcon: isAssistantMode ? undefined : 'text-secondary' }"
        data-slot="assistantToggle"
        @mousedown.prevent
        @click="switchMode"
      >
        {{
          isAssistantMode
            ? t("commandPalette.footer.backToSearch")
            : t("commandPalette.footer.askAi")
        }}
        <UKbd :value="ASSISTANT_MODE_KEY" size="sm" />
      </UButton>
    </template>
  </UDashboardSearch>
</template>
