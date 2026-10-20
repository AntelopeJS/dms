<script setup lang="ts">
import { computed } from "vue";
import { isFloatingSaveBarShown } from "#dms-ui/app/build/composables/form/floatingSaveBars";
import { useGithubStarPrompt } from "../../composables/general/useGithubStarPrompt";
import { useOpenDialog } from "../../composables/general/useOpenDialog";
import { useActiveSidePanel } from "../../composables/layout/sidePanelState";
import { useSidebarState } from "./sidebarState";

const TITLE_ID = "dms-github-star-prompt-title";
const DESCRIPTION_ID = "dms-github-star-prompt-description";

const { t } = useI18n();
const { user } = useCurrentUser();
const toast = useToast();
const { open: isSidebarOpen } = useSidebarState();
const { panel: sidePanel } = useActiveSidePanel();
const isDialogOpen = useOpenDialog();

// Developers only: a production build, a client's dashboard included, never
// counts, stores or shows anything. The same flag gates the dev reload.
const { isDue, snooze, star, dismiss } = useGithubStarPrompt(
  import.meta.env.DEV,
);

// The toaster stacks in the same corner, a floating save bar sticks to the
// bottom of the panel, and the phone sidebar keeps its account menu trigger
// at the bottom of the screen: the prompt steps aside while any is up rather
// than cover it. The sidebar only opens as a drawer, below `lg`. It waits
// as well while a drawer, a modal or a side panel is open, whose footer or
// content it would float over, and comes back once they close.
const isShown = computed(
  () =>
    isDue.value &&
    !!user.value &&
    toast.toasts.value.length === 0 &&
    !isFloatingSaveBarShown.value &&
    !isSidebarOpen.value &&
    !sidePanel.value &&
    !isDialogOpen.value,
);
</script>

<template>
  <!-- A non-modal dialog that takes no focus: it waits at the end of the tab
       order. Toast look (theme/surfaces.ts), in the toaster's corner and
       width, rising into place like a toast. The buttons take the card's
       full width, so the longer French label still fits beside "Later".
       On a phone it tightens and drops the icon, so the text runs the full
       width and covers less of the page. -->
  <div
    v-if="isShown"
    role="dialog"
    :aria-labelledby="TITLE_ID"
    :aria-describedby="DESCRIPTION_ID"
    class="bg-default ring-accented fixed inset-x-3 bottom-3 z-50 rounded-(--dms-radius-card) p-3 shadow-(--dms-shadow-pop) ring transition duration-300 ease-out motion-reduce:transition-none sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px] sm:p-3.5 sm:ps-4 starting:translate-y-4 starting:opacity-0"
  >
    <div class="flex items-start gap-3 pe-6">
      <DmsIconWell icon="i-ph-star" size="sm" class="max-sm:hidden" />
      <div class="min-w-0 flex-1">
        <h2
          :id="TITLE_ID"
          class="text-highlighted text-[13px]/[1.35] font-semibold"
        >
          {{ t("github_star_prompt.title") }}
        </h2>
        <p :id="DESCRIPTION_ID" class="text-muted mt-0.5 text-[13px]/[1.45]">
          {{ t("github_star_prompt.description") }}
        </p>
      </div>
    </div>
    <div class="mt-2.5 flex flex-wrap justify-end gap-1.5 sm:mt-3">
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :label="t('github_star_prompt.later')"
        data-action="later"
        @click="snooze"
      />
      <UButton
        size="sm"
        icon="i-ph-star"
        :label="t('github_star_prompt.star')"
        data-action="star"
        @click="star"
      />
    </div>
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      square
      icon="i-ph-x"
      class="text-dimmed hover:text-highlighted absolute top-2.5 right-2.5"
      :aria-label="t('github_star_prompt.close')"
      :title="t('github_star_prompt.close')"
      data-action="close"
      @click="dismiss"
    />
  </div>
</template>
