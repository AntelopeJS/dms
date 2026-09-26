<script setup lang="ts">
import ThemePreview from "../../build/components/pages/settings/theme/ThemePreview.vue";
import ScalePreview from "../../build/components/pages/settings/theme/ScalePreview.vue";
import CssVariablesList from "../../build/components/pages/settings/theme/CssVariablesList.vue";

const colorOptions: ColorModeOption[] = [
  {
    value: "system",
    label: "$page.settings.appearance.system",
  },
  {
    value: "light",
    label: "$page.settings.appearance.light",
  },
  {
    value: "dark",
    label: "$page.settings.appearance.dark",
  },
];

const scaleOptions: ScaleOption[] = [
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

const colorModePreference = useColorModePreference();
const interfaceScale = useInterfaceScale();
const { processI18n } = useTranslation();
</script>

<template>
  <div class="space-y-5 pb-16">
    <DmsCard as="section" class="grid gap-x-8 gap-y-6">
      <div class="space-y-1">
        <h2 class="text-default text-base font-semibold sm:text-sm">
          {{ $t("page.settings.appearance.theme_title") }}
        </h2>

        <p data-slot="text" class="text-dimmed text-base sm:text-sm">
          {{ $t("page.settings.appearance.theme_description") }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label
          v-for="(option, index) in colorOptions"
          :key="`color-option-${index}`"
          class="group bg-elevated relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all"
          :class="
            colorModePreference === option.value
              ? 'outline-primary outline-2 outline-offset-2'
              : 'ring-default hover:ring-accented ring hover:-translate-y-0.5'
          "
        >
          <input
            v-model="colorModePreference"
            type="radio"
            :value="option.value"
            class="sr-only"
          />

          <div class="flex justify-center p-4 pb-3">
            <ThemePreview
              :mode="option.value"
              class="ring-default/60 h-28 w-full rounded-lg ring"
            />
          </div>

          <div
            class="border-default flex items-center gap-2 border-t px-3 py-2.5"
          >
            <span
              class="ring-accented grid size-4 shrink-0 place-items-center rounded-full ring ring-inset"
              :class="
                colorModePreference === option.value
                  ? 'bg-primary ring-primary'
                  : ''
              "
            >
              <span
                v-if="colorModePreference === option.value"
                class="bg-default size-1.5 rounded-full"
              />
            </span>

            <span class="text-default truncate text-sm font-medium">
              {{ processI18n(option.label) }}
            </span>
          </div>
        </label>
      </div>
    </DmsCard>

    <DmsCard as="section" class="grid gap-x-8 gap-y-6">
      <div class="space-y-1">
        <h2 class="text-default text-base font-semibold sm:text-sm">
          {{ $t("page.settings.appearance.scale_title") }}
        </h2>

        <p data-slot="text" class="text-dimmed text-base sm:text-sm">
          {{ $t("page.settings.appearance.scale_description") }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label
          v-for="(option, index) in scaleOptions"
          :key="`scale-option-${index}`"
          class="group bg-elevated relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all"
          :class="
            interfaceScale === option.value
              ? 'outline-primary outline-2 outline-offset-2'
              : 'ring-default hover:ring-accented ring hover:-translate-y-0.5'
          "
        >
          <input
            v-model="interfaceScale"
            type="radio"
            :value="option.value"
            class="sr-only"
          />

          <div class="flex justify-center p-4 pb-3">
            <ScalePreview
              :scale="option.value"
              class="ring-default/60 h-28 w-full rounded-lg ring"
            />
          </div>

          <div
            class="border-default flex items-center gap-2 border-t px-3 py-2.5"
          >
            <span
              class="ring-accented grid size-4 shrink-0 place-items-center rounded-full ring ring-inset"
              :class="
                interfaceScale === option.value ? 'bg-primary ring-primary' : ''
              "
            >
              <span
                v-if="interfaceScale === option.value"
                class="bg-default size-1.5 rounded-full"
              />
            </span>

            <span class="text-default truncate text-sm font-medium">
              {{ processI18n(option.label) }}
            </span>

            <span class="text-dimmed ml-auto truncate font-mono text-[10px]">
              {{ processI18n(option.hint) }}
            </span>
          </div>
        </label>
      </div>
    </DmsCard>

    <DmsCard as="section">
      <CssVariablesList />
    </DmsCard>
  </div>
</template>
