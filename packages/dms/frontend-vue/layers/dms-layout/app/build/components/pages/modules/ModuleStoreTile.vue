<script setup lang="ts">
import ModuleTile from "./ModuleTile.vue";
import {
  MODULE_INSTALL_COMMAND,
  moduleInstallCommand,
  type ModuleStoreEntry,
} from "../../../utils/module-store-catalog";

interface ModuleStoreTileProps {
  /** The store module the tile presents. */
  entry: ModuleStoreEntry;
}

const props = defineProps<ModuleStoreTileProps>();
const { t } = useI18n();
const { processI18n } = useTranslation();

const TOOLTIP_CONTENT = { side: "top", sideOffset: 6 } as const;

const command = computed(() => moduleInstallCommand(props.entry));
</script>

<template>
  <ModuleTile
    :icon="props.entry.icon"
    :title="processI18n(props.entry.title)"
    :description="processI18n(props.entry.description)"
    :status="{
      tone: 'neutral',
      dot: 'none',
      label: t('modules.store.available_soon'),
    }"
  >
    <!-- The CLI command that adds the module today, shown muted: the store
         will run it for you once installing from here is possible. -->
    <div
      class="text-dimmed flex h-[30px] min-w-0 items-center gap-1.5 rounded-[8px] border border-(--ui-border) bg-(--dms-bg-muted) px-2.5 font-mono text-[11.5px]"
      :title="command"
    >
      <span class="sr-only">{{ t("modules.store.command_label") }}:</span>
      <!-- The package name never truncates: the CLI prefix gives way first. -->
      <span class="min-w-0 truncate">
        <span aria-hidden="true" class="opacity-70">$</span>
        {{ MODULE_INSTALL_COMMAND }}
      </span>
      <b class="text-toned shrink-0 font-semibold">
        {{ props.entry.packageName }}
      </b>
    </div>

    <template #footer>
      <span class="truncate">
        {{ processI18n(props.entry.catalogCategory) }}
      </span>
      <!-- aria-disabled rather than disabled: the button stays focusable and
           hoverable so its "Coming soon" tooltip can explain why. -->
      <span class="ms-auto shrink-0 font-sans">
        <UTooltip
          :text="t('modules.store.install_soon')"
          :content="TOOLTIP_CONTENT"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-ph-download-simple"
            :label="t('modules.store.install')"
            aria-disabled="true"
            @click.prevent
          />
        </UTooltip>
      </span>
    </template>
  </ModuleTile>
</template>
