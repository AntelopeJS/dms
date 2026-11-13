<script setup lang="ts">
import { computed, ref } from "vue";
import BrandingLogoTile from "./BrandingLogoTile.vue";
import BrandingValueInput from "./BrandingValueInput.vue";
import {
  isVariableName,
  STATUS_ROLES,
  THEME_PALETTES,
  THEME_TOKEN_GROUPS,
  tokenLabelKey,
  uncatalogedNames,
} from "./catalog";
import { slotFileName } from "./logo-tiles";
import { LOGO_SLOTS } from "./logos";
import {
  removeLogos,
  resetToDms,
  resetVariable,
  setColor,
  setVariable,
} from "./model";
import type { DmsTokens } from "./preview-style";
import {
  THEME_MODES,
  type ThemeMode,
  type ThemeVariableSetName,
} from "./theme-types";
import type { BrandingEditor } from "./useBrandingEditor";

const props = defineProps<{
  editor: BrandingEditor;
  tokens: DmsTokens;
  dmsColors: Partial<Record<string, string>>;
}>();

const { t } = useI18n();
const edit = computed(() => props.editor.edit.value);
const variables = computed(() => edit.value?.draft.variables);

const DMS_PALETTE = ":dms-default";
const paletteItems = computed(() => [
  { label: t("branding.developer.dms_palette"), value: DMS_PALETTE },
  ...THEME_PALETTES.map((palette) => ({ label: palette, value: palette })),
]);

const otherVariables = computed(() => {
  const sets = variables.value;
  if (!sets) return [];
  return (["shared", "light", "dark"] as const).flatMap((set) =>
    uncatalogedNames(Object.keys(sets[set])).map((name) => ({ set, name })),
  );
});

const newName = ref("");
const newValue = ref("");
const canAdd = computed(
  () => isVariableName(newName.value) && newValue.value.trim() !== "",
);

function defaultOf(name: string, mode: ThemeMode): string | undefined {
  return mode === "dark"
    ? (props.tokens.dark[name] ?? props.tokens.light[name])
    : props.tokens.light[name];
}

function write(set: ThemeVariableSetName, name: string, value: string): void {
  props.editor.update((current) => setVariable(current, set, name, value));
}

function add(): void {
  if (!canAdd.value) return;
  write("shared", newName.value, newValue.value);
  newName.value = "";
  newValue.value = "";
}

const modeLabel = (mode: ThemeMode) => t(`branding.developer.${mode}`);
</script>

<template>
  <div v-if="edit && variables" class="flex flex-col gap-5">
    <section
      v-for="group in THEME_TOKEN_GROUPS"
      :key="group.id"
      class="flex flex-col gap-2"
    >
      <div
        class="grid grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,1.2fr))] gap-2"
      >
        <DmsEyebrow :label="t(`branding.group.${group.id}`)" />
        <span
          v-for="mode in THEME_MODES"
          :key="mode"
          class="text-dimmed text-xs"
        >
          {{ modeLabel(mode) }}
        </span>
      </div>
      <div
        v-for="token in group.tokens"
        :key="token.name"
        class="grid grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,1.2fr))] items-start gap-2"
      >
        <span
          class="text-highlighted truncate pt-1 text-sm"
          :title="token.name"
        >
          {{ t(tokenLabelKey(token.name)) }}
        </span>
        <BrandingValueInput
          v-if="token.scope === 'shared'"
          class="col-span-2"
          :name="token.name"
          :value="variables.shared[token.name]"
          :placeholder="defaultOf(token.name, 'light')"
          :label="
            t('branding.developer.value', {
              name: t(tokenLabelKey(token.name)),
              mode: t('branding.developer.both'),
            })
          "
          @update="(value) => write('shared', token.name, value)"
        />
        <template v-else>
          <BrandingValueInput
            v-for="mode in THEME_MODES"
            :key="mode"
            :name="token.name"
            :value="variables[mode][token.name]"
            :placeholder="defaultOf(token.name, mode)"
            :label="
              t('branding.developer.value', {
                name: t(tokenLabelKey(token.name)),
                mode: modeLabel(mode),
              })
            "
            @update="(value) => write(mode, token.name, value)"
          />
        </template>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.other_variables')" />
      <div
        v-for="entry in otherVariables"
        :key="`${entry.set}:${entry.name}`"
        class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-start gap-2"
      >
        <span class="text-highlighted truncate pt-1 font-mono text-xs">
          {{ entry.name }}
        </span>
        <BrandingValueInput
          :name="entry.name"
          :value="variables[entry.set][entry.name]"
          :placeholder="undefined"
          :label="entry.name"
          @update="(value) => write(entry.set, entry.name, value)"
        />
        <UButton
          icon="i-ph-x-light"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="t('branding.developer.remove', { name: entry.name })"
          @click="
            props.editor.update((current) => resetVariable(current, entry.name))
          "
        />
      </div>
      <form class="flex gap-2" @submit.prevent="add">
        <UInput
          v-model="newName"
          size="xs"
          class="min-w-0 flex-1 font-mono"
          :placeholder="t('branding.developer.variable_name')"
          :aria-label="t('branding.developer.variable_name')"
        />
        <UInput
          v-model="newValue"
          size="xs"
          class="min-w-0 flex-1 font-mono"
          :aria-label="
            t('branding.developer.value', {
              name: newName,
              mode: t('branding.developer.both'),
            })
          "
        />
        <UButton type="submit" size="xs" :disabled="!canAdd">
          {{ t("branding.developer.add") }}
        </UButton>
      </form>
    </section>

    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.status')" />
      <div
        v-for="role in STATUS_ROLES"
        :key="role"
        class="flex items-center justify-between gap-3"
      >
        <span class="text-highlighted text-sm">
          {{ t(`branding.role.${role}`) }}
        </span>
        <USelect
          :model-value="edit.draft.colors[role] ?? DMS_PALETTE"
          :items="paletteItems"
          :placeholder="props.dmsColors[role]"
          :aria-label="t(`branding.role.${role}`)"
          size="xs"
          class="w-36"
          @update:model-value="
            (value: unknown) =>
              props.editor.update((current) =>
                setColor(
                  current,
                  role,
                  value === DMS_PALETTE ? undefined : String(value),
                ),
              )
          "
        />
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <DmsEyebrow :label="t('branding.section.logo_slots')" />
      <p
        v-if="props.editor.logoProblem.value"
        role="alert"
        class="text-error text-xs"
      >
        {{ t(props.editor.logoProblem.value) }}
      </p>
      <div class="grid grid-cols-2 gap-2">
        <template v-for="slot in LOGO_SLOTS" :key="slot">
          <BrandingLogoTile
            v-for="mode in THEME_MODES"
            :key="`${slot}:${mode}`"
            :label="`${t(`branding.logo.slot.${slot}`)} · ${modeLabel(mode)}`"
            :icon="mode === 'light' ? 'i-ph-sun-light' : 'i-ph-moon-light'"
            :file-name="slotFileName(edit, slot, mode)"
            :empty-hint="t('branding.logo.dms_default')"
            @pick="(file) => props.editor.pickLogo([{ slot, mode }], file)"
            @remove="
              props.editor.update((current) =>
                removeLogos(current, [slot], mode),
              )
            "
          />
        </template>
      </div>
    </section>

    <UButton
      color="neutral"
      variant="outline"
      icon="i-ph-arrow-counter-clockwise-light"
      class="self-start"
      @click="props.editor.update(resetToDms)"
    >
      {{ t("branding.developer.reset_all") }}
    </UButton>
  </div>
</template>
