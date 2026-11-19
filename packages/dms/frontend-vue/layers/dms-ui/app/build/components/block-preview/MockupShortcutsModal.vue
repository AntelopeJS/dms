<script setup lang="ts">
import { useMockupShortcutKeys } from "../../composables/block-preview/useMockupShortcutKeys";
import {
  MOCKUP_SHORTCUT_GROUPS,
  shortcutsOf,
} from "../../utils/mockupShortcuts";

/**
 * The sheet of every shortcut of the viewer, grouped, read from the shortcuts
 * table the key handler and the tooltips read too.
 */
const isOpen = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const { combosOf } = useMockupShortcutKeys();

const groups = MOCKUP_SHORTCUT_GROUPS.map((group) => ({
  group,
  ids: shortcutsOf(group),
}));
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('dms.mockup.shortcuts_title')"
    :description="t('dms.mockup.shortcuts_description')"
  >
    <template #body>
      <div class="space-y-5" data-dms-mockup-shortcuts>
        <section
          v-for="{ group, ids } in groups"
          :key="group"
          class="space-y-1.5"
          :data-dms-mockup-shortcut-group="group"
        >
          <h3
            class="text-dimmed text-[11px] font-semibold tracking-wider uppercase"
          >
            {{ t(`dms.mockup.shortcut_group_${group}`) }}
          </h3>
          <dl class="divide-default divide-y">
            <div
              v-for="id in ids"
              :key="id"
              class="flex items-center justify-between gap-4 py-1.5 text-sm"
              :data-dms-mockup-shortcut="id"
            >
              <dt class="text-default">{{ t(`dms.mockup.shortcut_${id}`) }}</dt>
              <dd class="flex shrink-0 items-center gap-1.5">
                <template
                  v-for="(keys, comboIndex) in combosOf(id)"
                  :key="comboIndex"
                >
                  <span v-if="comboIndex > 0" class="text-dimmed text-xs">
                    /
                  </span>
                  <span class="flex gap-1" data-dms-mockup-shortcut-keys>
                    <UKbd v-for="key in keys" :key="key" :value="key" />
                  </span>
                </template>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </template>
  </UModal>
</template>
