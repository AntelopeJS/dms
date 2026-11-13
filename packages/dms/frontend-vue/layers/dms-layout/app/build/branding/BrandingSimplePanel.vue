<script setup lang="ts">
import { computed } from "vue";
import BrandingColorPair from "./BrandingColorPair.vue";
import BrandingLogoTile from "./BrandingLogoTile.vue";
import BrandingPaletteSwatches from "./BrandingPaletteSwatches.vue";
import { BACKGROUND_TOKENS, CORNER_PRESETS, FONT_VARIABLE } from "./catalog";
import { DMS_FONT_FAMILY, fontStack, themeFontOf, THEME_FONTS } from "./fonts";
import { simpleTiles, type LogoTarget } from "./logo-tiles";
import {
  activeCorners,
  removeLogos,
  setColor,
  setCorners,
  setFont,
  setVariable,
} from "./model";
import type { ThemeMode } from "./theme-types";
import type { BrandingEditor } from "./useBrandingEditor";

const props = defineProps<{
  editor: BrandingEditor;
  styles: Record<ThemeMode, Record<string, string>>;
  dmsColors: Partial<Record<string, string>>;
}>();

const { t } = useI18n();
const edit = computed(() => props.editor.edit.value);

const accent = computed(
  () => edit.value?.draft.colors.primary ?? props.dmsColors.primary,
);
const corners = computed(() =>
  edit.value ? activeCorners(edit.value.draft)?.id : undefined,
);
const font = computed(
  () =>
    themeFontOf(edit.value?.draft.variables.shared[FONT_VARIABLE])?.family ??
    DMS_FONT_FAMILY,
);
const fontItems = computed(() => [
  { label: t("branding.font.dms"), value: DMS_FONT_FAMILY },
  ...THEME_FONTS.map((entry) => ({ label: entry.family, value: entry.family })),
]);
const tiles = computed(() => (edit.value ? simpleTiles(edit.value) : []));

function pickAccent(palette: string): void {
  const value = palette === props.dmsColors.primary ? undefined : palette;
  props.editor.update((current) => setColor(current, "primary", value));
}

function pickFont(family: string): void {
  const entry = THEME_FONTS.find((candidate) => candidate.family === family);
  props.editor.update((current) =>
    setFont(current, entry ? fontStack(entry) : undefined),
  );
}

function removeTile(targets: LogoTarget[]): void {
  props.editor.update((current) =>
    targets.reduce(
      (next, { slot, mode }) => removeLogos(next, [slot], mode),
      current,
    ),
  );
}

const TILE_HINTS = {
  light: "branding.logo.dms_default",
  dark: "branding.logo.dms_default",
  favicon: "branding.logo.favicon_hint",
  email: "branding.logo.email_hint",
} as const;
</script>

<template>
  <div v-if="edit" class="flex flex-col gap-5">
    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.accent')" />
      <BrandingPaletteSwatches :selected="accent" @select="pickAccent" />
    </section>

    <section class="flex flex-col gap-2.5">
      <div class="flex items-center justify-between">
        <DmsEyebrow :label="t('branding.section.backgrounds')" />
        <UBadge
          color="neutral"
          variant="soft"
          size="sm"
          class="font-mono tracking-[0.12em] uppercase"
        >
          {{ t("branding.section.light_dark") }}
        </UBadge>
      </div>
      <BrandingColorPair
        v-for="row in BACKGROUND_TOKENS"
        :key="row.id"
        :label="t(`branding.background.${row.id}`)"
        :name="row.name"
        :styles="props.styles"
        :preview-mode="props.editor.previewMode.value"
        @update="
          (mode, value) =>
            props.editor.update((current) =>
              setVariable(current, mode, row.name, value),
            )
        "
      />
    </section>

    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.corners')" />
      <div class="flex flex-wrap gap-1.5">
        <UButton
          v-for="preset in CORNER_PRESETS"
          :key="preset.id"
          size="sm"
          :color="corners === preset.id ? 'primary' : 'neutral'"
          :variant="corners === preset.id ? 'soft' : 'outline'"
          :aria-pressed="corners === preset.id"
          @click="
            props.editor.update((current) =>
              setCorners(current, corners === preset.id ? null : preset),
            )
          "
        >
          {{ t(`branding.corners.${preset.id}`) }}
        </UButton>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.font')" />
      <USelect
        :model-value="font"
        :items="fontItems"
        :aria-label="t('branding.section.font')"
        class="w-full"
        @update:model-value="(value: unknown) => pickFont(String(value))"
      >
        <template #item-label="{ item }">
          <span :style="{ fontFamily: `'${item.value}'` }">
            {{ item.label }}
          </span>
        </template>
      </USelect>
    </section>

    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.logos')" />
      <p
        v-if="props.editor.logoProblem.value"
        role="alert"
        class="text-error text-xs"
      >
        {{ t(props.editor.logoProblem.value) }}
      </p>
      <div class="grid grid-cols-2 gap-2">
        <BrandingLogoTile
          v-for="tile in tiles"
          :key="tile.id"
          :label="t(`branding.logo.${tile.id}`)"
          :icon="tile.icon"
          :file-name="tile.fileName"
          :empty-hint="t(TILE_HINTS[tile.id])"
          @pick="(file) => props.editor.pickLogo(tile.targets, file)"
          @remove="removeTile(tile.targets)"
        />
      </div>
    </section>
  </div>
</template>
