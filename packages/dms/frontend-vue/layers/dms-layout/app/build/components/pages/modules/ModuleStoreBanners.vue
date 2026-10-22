<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/build/utils/monoChip";
import { FRONTEND_BUILD_COMMAND } from "../../../utils/module-store-catalog";
import type { StoreListing } from "../../../../types/module-store";
import type { StoreFrontendNotice } from "../../../../composables/page/useModuleStoreActions";

// What keeps the store from changing modules here, and what follows a
// change while the interface lags behind the backend: shown above the
// installed modules and the store alike.

interface ModuleStoreBannersProps {
  listing: StoreListing | undefined;
  frontendNotice: StoreFrontendNotice | null;
}

const props = defineProps<ModuleStoreBannersProps>();
const { t } = useI18n();
</script>

<template>
  <DmsBanner
    v-if="props.listing?.configError"
    class="mb-4"
    tone="error"
    size="sm"
    icon="i-ph-file-x"
    :title="t('modules.store.config_error')"
    :description="props.listing.configError"
  />
  <DmsBanner
    v-else-if="props.listing && !props.listing.enabled"
    class="mb-4"
    tone="info"
    size="sm"
    icon="i-ph-lock-simple"
    :title="t('modules.store.disabled.title')"
    :description="t('modules.store.disabled.description')"
  />

  <!-- The interface lags behind the backend: say what follows. -->
  <DmsBanner
    v-if="props.frontendNotice"
    class="mb-4"
    :tone="props.frontendNotice.key === 'dev' ? 'info' : 'warning'"
    size="sm"
    :icon="
      props.frontendNotice.key === 'dev'
        ? 'i-ph-circle-notch'
        : 'i-ph-arrows-clockwise'
    "
    :title="
      t(`modules.store.frontend.${props.frontendNotice.key}.title`, {
        modules: props.frontendNotice.names,
      })
    "
  >
    <template #description>
      <i18n-t
        :keypath="`modules.store.frontend.${props.frontendNotice.key}.description`"
        scope="global"
        tag="span"
      >
        <template #command>
          <code
            :class="[MONO_CHIP_CLASS, 'bg-elevated text-highlighted text-xs']"
          >
            {{ FRONTEND_BUILD_COMMAND }}
          </code>
        </template>
      </i18n-t>
    </template>
  </DmsBanner>
</template>
