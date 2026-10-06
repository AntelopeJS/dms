<script setup lang="ts">
import ThemePreview from "../../build/components/pages/settings/theme/ThemePreview.vue";
import ScalePreview from "../../build/components/pages/settings/theme/ScalePreview.vue";
import CssVariablesList from "../../build/components/pages/settings/theme/CssVariablesList.vue";
import AppearanceOptionTile from "../../build/components/pages/settings/theme/AppearanceOptionTile.vue";
import { useSidebarStartCollapsed } from "../../composables/general/useSidebarStartCollapsed";
import { useAccessibilityPreferences } from "../../composables/general/useAccessibilityPreferences";
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import type { ReduceMotionPreference } from "#dms-ui/app/utils/accessibilityPreferences";
import { useInstantSaveHeader } from "../../composables/layout/useInstantSaveHeader";
import { useInstantSave } from "#dms-ui/app/build/composables/instant-save/useInstantSave";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";

// Number of `--ui-*` variables, shown in the Developer block summary.
const cssVariableCount = ref<number | null>(null);

interface AppearanceColorOption {
  value: ColorModePreference;
  label: string;
  hint: string;
  icon: string;
}

interface AppearanceScaleOption {
  value: InterfaceScale;
  label: string;
  hint: string;
}

const colorOptions: AppearanceColorOption[] = [
  {
    value: "system",
    label: "$page.settings.appearance.system",
    hint: "$page.settings.appearance.system_hint",
    icon: "i-ph-desktop",
  },
  {
    value: "light",
    label: "$page.settings.appearance.light",
    hint: "$page.settings.appearance.light_hint",
    icon: "i-ph-sun",
  },
  {
    value: "dark",
    label: "$page.settings.appearance.dark",
    hint: "$page.settings.appearance.dark_hint",
    icon: "i-ph-moon",
  },
];

const scaleOptions: AppearanceScaleOption[] = [
  {
    value: "small",
    label: "$page.settings.appearance.scale_small",
    hint: "$page.settings.appearance.scale_small_hint",
  },
  {
    value: "normal",
    label: "$page.settings.appearance.scale_normal",
    hint: "$page.settings.appearance.scale_normal_hint",
  },
  {
    value: "large",
    label: "$page.settings.appearance.scale_large",
    hint: "$page.settings.appearance.scale_large_hint",
  },
];

const reduceMotionValues: ReduceMotionPreference[] = ["auto", "on", "off"];

const colorModePreference = useColorModePreference();
const interfaceScale = useInterfaceScale();
const sidebarStartCollapsed = useSidebarStartCollapsed();
const { t } = useI18n();
const { reduceMotion, increaseContrast, underlineLinks } =
  useAccessibilityPreferences();

const reduceMotionItems = computed(() =>
  reduceMotionValues.map((value) => ({
    value,
    label: t(`page.settings.appearance.accessibility.motion_${value}`),
  })),
);

// Everything on this page is a per-device preference kept in a cookie: each
// pick goes through the shared instant save, whose cookie write is the save,
// and the header pill states it once instead of per control.
const preferenceRefs = {
  colorMode: colorModePreference,
  interfaceScale,
  sidebarStartCollapsed,
  reduceMotion,
  increaseContrast,
  underlineLinks,
};
type AppearancePreferences = {
  [K in keyof typeof preferenceRefs]: (typeof preferenceRefs)[K]["value"];
};
type AppearanceKey = keyof AppearancePreferences;

const instant = useInstantSave<AppearancePreferences>({
  read: (key) => preferenceRefs[key].value as AppearancePreferences[typeof key],
  write: (key, value) => {
    (preferenceRefs[key] as Ref<AppearancePreferences[typeof key]>).value =
      value;
  },
  save: () => Promise.resolve(),
});

function pick<K extends AppearanceKey>(
  key: K,
  value: AppearancePreferences[K],
): void {
  instant.change(key, value);
}

function pickColorMode(value: string): void {
  const option = colorOptions.find((entry) => entry.value === value);
  if (option) pick("colorMode", option.value);
}

function pickScale(value: string): void {
  const option = scaleOptions.find((entry) => entry.value === value);
  if (option) pick("interfaceScale", option.value);
}

function setReduceMotion(value: string | number | undefined): void {
  const next = reduceMotionValues.find((option) => option === value);
  if (next) pick("reduceMotion", next);
}

useInstantSaveHeader(() => instant.state.value);
</script>

<template>
  <div>
    <DmsSection
      title="$page.settings.appearance.theme_title"
      description="$page.settings.appearance.theme_description"
    >
      <div class="grid grid-cols-1 gap-3.5 p-[18px] sm:grid-cols-3">
        <AppearanceOptionTile
          v-for="option in colorOptions"
          :key="option.value"
          :model-value="colorModePreference"
          name="color-mode"
          :value="option.value"
          :label="option.label"
          :hint="option.hint"
          :icon="option.icon"
          @update:model-value="pickColorMode"
        >
          <template #preview>
            <ThemePreview :mode="option.value" class="h-[118px] w-full" />
          </template>
        </AppearanceOptionTile>
      </div>
    </DmsSection>

    <DmsSection
      title="$page.settings.appearance.scale_title"
      description="$page.settings.appearance.scale_description"
    >
      <div class="grid grid-cols-1 gap-3.5 p-[18px] sm:grid-cols-3">
        <AppearanceOptionTile
          v-for="option in scaleOptions"
          :key="option.value"
          :model-value="interfaceScale"
          name="interface-scale"
          :value="option.value"
          :label="option.label"
          :hint="option.hint"
          @update:model-value="pickScale"
        >
          <template #preview>
            <ScalePreview :scale="option.value" class="h-[118px] w-full" />
          </template>
        </AppearanceOptionTile>
      </div>
    </DmsSection>

    <DmsSection
      title="$page.settings.appearance.accessibility.title"
      description="$page.settings.appearance.accessibility.description"
    >
      <DmsFieldRow
        label="$page.settings.appearance.accessibility.reduce_motion"
        description="$page.settings.appearance.accessibility.reduce_motion_hint"
      >
        <DmsSegmented
          :model-value="reduceMotion"
          :items="reduceMotionItems"
          :aria-label="
            t('page.settings.appearance.accessibility.reduce_motion')
          "
          @update:model-value="setReduceMotion"
        />
      </DmsFieldRow>
      <DmsFieldRow
        label="$page.settings.appearance.accessibility.increase_contrast"
        description="$page.settings.appearance.accessibility.increase_contrast_hint"
      >
        <USwitch
          :model-value="increaseContrast"
          @update:model-value="pick('increaseContrast', $event)"
          :aria-label="
            t('page.settings.appearance.accessibility.increase_contrast')
          "
        />
      </DmsFieldRow>
      <DmsFieldRow
        label="$page.settings.appearance.accessibility.underline_links"
        description="$page.settings.appearance.accessibility.underline_links_hint"
      >
        <USwitch
          :model-value="underlineLinks"
          @update:model-value="pick('underlineLinks', $event)"
          :aria-label="
            t('page.settings.appearance.accessibility.underline_links')
          "
        />
      </DmsFieldRow>
    </DmsSection>

    <DmsSection
      title="$page.settings.appearance.sidebar_title"
      description="$page.settings.appearance.sidebar_description"
    >
      <DmsFieldRow
        label="$page.settings.appearance.sidebar_start_collapsed"
        description="$page.settings.appearance.sidebar_start_collapsed_hint"
      >
        <USwitch
          :model-value="sidebarStartCollapsed"
          @update:model-value="pick('sidebarStartCollapsed', $event)"
          :aria-label="t('page.settings.appearance.sidebar_start_collapsed')"
        />
      </DmsFieldRow>
    </DmsSection>

    <DmsSection
      title="$page.settings.appearance.developer_title"
      description="$page.settings.appearance.developer_description"
    >
      <!-- Collapsed by default: only module authors need the tokens. -->
      <details class="group">
        <summary
          class="hover:bg-elevated/60 flex cursor-pointer list-none items-center gap-3 px-[18px] py-3.5"
        >
          <DmsIconWell icon="i-ph-brackets-curly" tone="muted" size="md" />
          <span class="min-w-0 flex-1">
            <span class="text-highlighted block text-[13px] font-semibold">
              {{ t("page.settings.appearance.css_variables") }}
            </span>
            <span class="text-muted block text-[12.5px]">
              {{ t("page.settings.appearance.css_variables_description") }}
              ·
              <!-- The variables are read after mount: a placeholder holds
                   the count's place until then. -->
              <USkeleton
                v-if="cssVariableCount === null"
                aria-hidden="true"
                class="inline-block h-2.5 w-20 align-middle"
              />
              <span v-else class="font-mono tabular-nums">
                {{
                  t("page.settings.appearance.css_vars.count", {
                    count: cssVariableCount,
                  })
                }}
              </span>
            </span>
          </span>
          <UIcon
            name="i-ph-caret-down"
            class="text-dimmed size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div class="border-default border-t">
          <CssVariablesList @loaded="cssVariableCount = $event" />
        </div>
      </details>
    </DmsSection>
  </div>
</template>
