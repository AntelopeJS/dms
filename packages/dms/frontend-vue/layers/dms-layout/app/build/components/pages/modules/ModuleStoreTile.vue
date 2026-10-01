<script setup lang="ts">
import {
  MODULE_INSTALL_COMMAND,
  moduleInstallCommand,
  type ModuleStoreEntry,
} from "../../../../utils/module-store-catalog";

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
  <article
    class="flex min-h-[228px] flex-col gap-3 overflow-hidden rounded-(--dms-radius-card) border border-dashed border-(--ui-border-accented) px-4 pt-4"
    :aria-label="processI18n(props.entry.title)"
  >
    <!-- v2 .mc-tile.is-available: a dashed, transparent tile with a quiet
         icon and no live readout, since the module does not run here. -->
    <div class="flex items-start justify-between gap-2.5">
      <DmsIconWell :icon="props.entry.icon" tone="muted" />
      <DmsStatusPill
        tone="neutral"
        dot="none"
        :label="t('modules.store.available_soon')"
        size="sm"
        uppercase
      />
    </div>

    <div
      class="text-highlighted mt-auto truncate text-lg font-[650] tracking-[-0.02em]"
    >
      {{ processI18n(props.entry.title) }}
    </div>
    <p class="text-muted -mt-1.5 line-clamp-2 text-sm leading-[1.45]">
      {{ processI18n(props.entry.description) }}
    </p>

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

    <div
      class="text-dimmed -mx-4 mt-0.5 flex items-center gap-2 border-t border-(--ui-border-muted) py-[7px] ps-4 pe-3 font-mono text-[11px] font-medium"
    >
      <span class="truncate">{{ processI18n(props.entry.category) }}</span>
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
    </div>
  </article>
</template>
