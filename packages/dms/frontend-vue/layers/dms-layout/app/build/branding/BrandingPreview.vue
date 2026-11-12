<script setup lang="ts">
import { computed } from "vue";
import { logoDataUrl } from "./logos";
import { logoView, type ThemeEdit } from "./model";
import { previewStyle, type DmsTokens } from "./preview-style";
import type { LogoSlot, ThemeMode } from "./theme-types";

/**
 * A mini dashboard painted only through CSS variables, whose root carries the
 * DMS tokens and the draft for one mode: the live page keeps its own theme.
 */
const props = defineProps<{
  edit: ThemeEdit;
  mode: ThemeMode;
  tokens: DmsTokens;
  dmsColors: Partial<Record<string, string>>;
  dmsLogos: Partial<Record<LogoSlot, Partial<Record<ThemeMode, string>>>>;
}>();

const { t } = useI18n();

const style = computed(() =>
  previewStyle({
    tokens: props.tokens,
    draft: props.edit.draft,
    mode: props.mode,
    dmsColors: props.dmsColors,
  }),
);

const logoSource = computed(() => {
  const view = logoView(props.edit, "default", props.mode, props.dmsLogos);
  return view.kind === "pending" ? logoDataUrl(view.logo) : view.path;
});

const NAV = ["dashboard", "bikes", "rentals"] as const;
const STATS = [
  { key: "revenue", value: "€6,240" },
  { key: "rentals", value: "42" },
  { key: "bikes", value: "118" },
] as const;
</script>

<template>
  <div
    data-branding-preview
    :data-mode="mode"
    :style="style"
    class="flex min-h-[420px] overflow-hidden rounded-(--dms-radius-card) border border-(--ui-border) bg-(--ui-bg-muted) font-sans text-(--ui-text)"
  >
    <aside
      class="flex w-44 shrink-0 flex-col gap-1 border-e border-(--ui-border) bg-(--dms-bg-sidebar) p-2"
    >
      <div class="flex h-9 items-center px-1.5">
        <img
          v-if="logoSource"
          data-preview-logo
          :src="logoSource"
          :alt="t('branding.preview.sample.name')"
          class="h-5 max-w-full object-contain object-left"
        />
      </div>
      <span
        v-for="(entry, index) in NAV"
        :key="entry"
        class="rounded-(--ui-radius) px-2 py-1.5 text-xs"
        :class="
          index === 0
            ? 'bg-(--dms-accent-tint) font-medium text-(--ui-primary)'
            : 'text-(--ui-text-muted)'
        "
      >
        {{ t(`branding.preview.sample.${entry}`) }}
      </span>
    </aside>
    <main class="flex min-w-0 flex-1 flex-col gap-3 p-3">
      <h3 class="text-sm font-semibold text-(--ui-text-highlighted)">
        {{ t("branding.preview.sample.dashboard") }}
      </h3>
      <div class="grid grid-cols-3 gap-2">
        <div
          v-for="stat in STATS"
          :key="stat.key"
          class="rounded-(--dms-radius-card) border border-(--ui-border) bg-(--ui-bg) px-2.5 py-2"
        >
          <p class="text-[10px] text-(--ui-text-muted)">
            {{ t(`branding.preview.sample.${stat.key}`) }}
          </p>
          <p class="text-sm font-semibold text-(--ui-text-highlighted)">
            {{ stat.value }}
          </p>
        </div>
      </div>
      <span
        class="self-start rounded-[calc(var(--ui-radius)*1.5)] bg-(--dms-accent-fill) px-2.5 py-1 text-xs font-medium text-(--dms-accent-on-fill)"
      >
        {{ t("branding.preview.sample.new_rental") }}
      </span>
      <div
        class="min-h-28 flex-1 rounded-(--dms-radius-card) border border-(--ui-border) bg-(--ui-bg)"
      />
    </main>
  </div>
</template>
