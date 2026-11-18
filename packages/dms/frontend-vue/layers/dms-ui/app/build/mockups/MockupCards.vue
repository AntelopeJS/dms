<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import type { TableViewDisplayContext } from "../../composables/table-view/types";
import DmsTableEmpty from "../components/table/TableEmpty.vue";
import DmsTablePagination from "../components/table/TablePagination.vue";
import MockupPromptModal from "../components/block-preview/MockupPromptModal.vue";
import { parseMockupSummary, type MockupSummary } from "../utils/mockup";
import { dispatchMockupAssistantPrompt } from "../utils/mockupHandoff";
import MockupCard from "./MockupCard.vue";
import {
  deleteMockup,
  duplicateMockup,
  type MockupRenameRequest,
  renameMockup,
} from "./manage";
import MockupRenameModal from "./MockupRenameModal.vue";
import { resyncFromPage } from "./resync";

/**
 * The display of the Mockups page: a "New mockup" card first, then one card
 * per mockup. A card opens the mockup's viewer and has a menu to rename, copy
 * or delete it. The new mockup card hands the AI assistant a starter request,
 * and shows it to copy when no assistant takes it.
 */
const props = defineProps<{ context: TableViewDisplayContext }>();

const SKELETON_COUNT = 3;
const VIEWER_PATH = "/mockup";
const STARTER_ELLIPSIS = " …";

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
const { presentError } = useApiErrorPresenter();
const { confirm } = useConfirm();
const toast = useToast();
const router = useDmsRouter();

/** The path of the page being turned back into its mockup, while it is. */
const resyncing = ref<string>();
const renaming = shallowRef<MockupSummary>();
const isRenaming = ref(false);
/** The request no assistant claimed, shown for the developer to copy. */
const unclaimed = shallowRef<string>();

const mockups = computed(() =>
  props.context.items.flatMap((row) => parseMockupSummary(row) ?? []),
);

function labelOf(mockup: MockupSummary): string {
  return mockup.title || mockup.name;
}

function newMockup(): void {
  const prompt = t("dms.mockup.new_prompt");
  const isClaimed = dispatchMockupAssistantPrompt({
    prompt,
    source: "new-mockup",
  });
  if (!isClaimed) unclaimed.value = `${prompt.trimEnd()}${STARTER_ELLIPSIS}`;
}

function open(mockup: MockupSummary): void {
  void router.push(`${VIEWER_PATH}?name=${encodeURIComponent(mockup.name)}`);
}

async function resync(mockup: string, path: string): Promise<void> {
  resyncing.value = path;
  try {
    await router.push(await resyncFromPage($authFetch, mockup, path));
  } catch (error) {
    presentError(error, { fallbackKey: "dms.mockup.resync_failed" });
  } finally {
    resyncing.value = undefined;
  }
}

async function rename(change: MockupRenameRequest): Promise<void> {
  const target = renaming.value;
  if (!target) return;
  isRenaming.value = true;
  try {
    await renameMockup($authFetch, target.name, change);
    renaming.value = undefined;
    await props.context.refresh();
  } catch (error) {
    presentError(error, { fallbackKey: "dms.mockup.rename_failed" });
  } finally {
    isRenaming.value = false;
  }
}

async function duplicate(mockup: MockupSummary): Promise<void> {
  try {
    const name = await duplicateMockup($authFetch, mockup.name);
    toast.add({
      color: "success",
      title: t("dms.mockup.duplicated", { name }),
    });
    await props.context.refresh();
  } catch (error) {
    presentError(error, { fallbackKey: "dms.mockup.duplicate_failed" });
  }
}

async function remove(mockup: MockupSummary): Promise<void> {
  const isConfirmed = await confirm({
    title: t("dms.mockup.delete_title", { name: labelOf(mockup) }),
    description: t("dms.mockup.delete_description"),
    icon: "i-lucide-trash-2",
    color: "error",
    confirmIcon: "i-lucide-trash-2",
    confirmLabel: t("dms.mockup.remove"),
    cancelLabel: t("dms.mockup.cancel"),
    initialFocus: "cancel",
    onConfirm: () => deleteMockup($authFetch, mockup.name),
  });
  if (isConfirmed) await props.context.refresh();
}
</script>

<template>
  <div>
    <ul
      v-if="context.firstPageLoading"
      class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
    >
      <li
        v-for="index in SKELETON_COUNT"
        :key="index"
        class="ring-default overflow-hidden rounded-lg ring-1"
      >
        <USkeleton class="aspect-[16/10] rounded-none" />
        <div class="space-y-2 p-3.5">
          <USkeleton class="h-4 w-2/3" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </li>
    </ul>

    <div
      v-else-if="!mockups.length"
      class="flex flex-col items-center gap-4 p-4"
    >
      <DmsTableEmpty :can-add-row="false" />
      <UButton
        icon="i-lucide-plus"
        size="md"
        data-dms-mockup-new
        @click="newMockup"
      >
        {{ t("dms.mockup.new_title") }}
      </UButton>
    </div>

    <ul
      v-else
      class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3"
      data-dms-mockup-cards
    >
      <li class="flex">
        <button
          type="button"
          class="border-accented text-muted hover:border-primary hover:text-highlighted focus-visible:outline-primary flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          data-dms-mockup-new
          @click="newMockup"
        >
          <span
            class="bg-elevated ring-default grid size-10 place-items-center rounded-full ring-1"
          >
            <UIcon name="i-lucide-plus" class="size-5" />
          </span>
          <span class="space-y-1">
            <span class="text-highlighted block text-sm font-semibold">
              {{ t("dms.mockup.new_title") }}
            </span>
            <span class="block max-w-[28ch] text-xs">
              {{ t("dms.mockup.new_hint") }}
            </span>
          </span>
        </button>
      </li>
      <MockupCard
        v-for="mockup in mockups"
        :key="mockup.name"
        :mockup="mockup"
        :resyncing="resyncing"
        @open="open(mockup)"
        @rename="renaming = mockup"
        @duplicate="duplicate(mockup)"
        @delete="remove(mockup)"
        @resync="(path) => resync(mockup.name, path)"
      />
    </ul>

    <DmsTablePagination />
    <MockupRenameModal
      v-model:mockup="renaming"
      :saving="isRenaming"
      @submit="rename"
    />
    <MockupPromptModal v-model:prompt="unclaimed" />
  </div>
</template>
