<script setup lang="ts">
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import {
  buildTimeZoneOptions,
  listTimeZones,
  timeZoneLabel,
  timeZoneOffset,
} from "./timeZones";

const AUTO = "auto";
const ITEM_HEIGHT = 32;

interface Props {
  id?: string;
  disabled?: boolean;
}

const props = defineProps<Props>();
const model = defineModel<string | null>();

const { t } = useI18n();
const { detectedTimeZone } = useUserRegionalPreferences();

const now = new Date();

const options = computed(() => [
  {
    value: AUTO,
    label: t("page.settings.region.time_zone_auto", {
      zone: timeZoneLabel(detectedTimeZone),
    }),
    offset: timeZoneOffset(detectedTimeZone, now),
  },
  ...buildTimeZoneOptions(listTimeZones(), now, [
    detectedTimeZone,
    model.value && model.value !== AUTO ? model.value : "",
  ]),
]);
</script>

<template>
  <USelectMenu
    :id="props.id"
    v-model="model"
    class="w-[300px] max-w-full"
    icon="i-ph-globe-hemisphere-west"
    :items="options"
    value-key="value"
    label-key="label"
    :disabled="props.disabled"
    :filter-fields="['label', 'value', 'offset']"
    :search-input="{ placeholder: t('page.settings.region.time_zone_search') }"
    :virtualize="{ estimateSize: ITEM_HEIGHT }"
    :aria-label="t('dms.a11y.show_options')"
  >
    <template #item-trailing="{ item }">
      <span class="text-dimmed font-mono text-[11px]">{{ item.offset }}</span>
    </template>
  </USelectMenu>
</template>
