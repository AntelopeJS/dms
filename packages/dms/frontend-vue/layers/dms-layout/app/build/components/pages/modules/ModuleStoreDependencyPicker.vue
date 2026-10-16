<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/build/utils/monoChip";
import type { MissingInterface } from "../../../../types/module-store";
import {
  type DependencyDraft,
  type DependencyDraftError,
  OTHER_PACKAGE_CHOICE,
  validateDependencyDraft,
} from "../../../utils/module-store-install";

interface ModuleStoreDependencyPickerProps {
  /** The interfaces the release needs and no running module implements. */
  missing: MissingInterface[];
  /** One draft per missing interface, in the same order. */
  drafts: DependencyDraft[];
  /** Confirm was tried: the fields say what is wrong. */
  showErrors?: boolean;
}

interface ModuleStoreDependencyPickerEmits {
  update: [index: number, patch: Partial<DependencyDraft>];
}

const props = withDefaults(defineProps<ModuleStoreDependencyPickerProps>(), {
  showErrors: false,
});
const emit = defineEmits<ModuleStoreDependencyPickerEmits>();
const { t } = useI18n();

const CONFIG_PLACEHOLDER = "{}";
const CONFIG_ROWS = 3;

const groups = computed(() =>
  props.missing.map((missing, index) => {
    const draft = props.drafts[index];
    const errors =
      props.showErrors && draft ? validateDependencyDraft(draft) : {};
    return {
      missing,
      draft,
      errors,
      items: [
        ...missing.candidates.map((candidate) => ({
          label: candidate.name,
          description: candidate.package,
          value: candidate.package,
        })),
        {
          label: t("modules.store.install_dialog.other"),
          value: OTHER_PACKAGE_CHOICE,
        },
      ],
    };
  }),
);

function errorText(error: DependencyDraftError | undefined) {
  return error ? t(`modules.store.install_dialog.errors.${error}`) : undefined;
}

/** Sends `field` of draft `index` as the control typed it. */
function updateField(
  index: number,
  field: keyof DependencyDraft,
  value: unknown,
): void {
  emit("update", index, { [field]: String(value ?? "") });
}

function fieldId(index: number, field: string): string {
  return `store-dependency-${index}-${field}`;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section
      v-for="(group, index) in groups"
      :key="group.missing.interfacePackage"
      class="flex flex-col gap-2.5"
      :aria-labelledby="fieldId(index, 'title')"
    >
      <h4
        :id="fieldId(index, 'title')"
        class="text-highlighted text-[13px] font-semibold"
      >
        <code :class="[MONO_CHIP_CLASS, 'bg-elevated text-xs']">
          {{ group.missing.interfacePackage }}
        </code>
      </h4>
      <template v-if="group.draft">
        <URadioGroup
          :model-value="group.draft.choice"
          :items="group.items"
          size="sm"
          :aria-labelledby="fieldId(index, 'title')"
          @update:model-value="updateField(index, 'choice', $event)"
        />
        <UFormField
          v-if="group.draft.choice === OTHER_PACKAGE_CHOICE"
          :label="t('modules.store.install_dialog.package_label')"
          :error="errorText(group.errors.package)"
        >
          <UInput
            :id="fieldId(index, 'package')"
            :model-value="group.draft.otherPackage"
            class="w-full font-mono"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('modules.store.install_dialog.package_placeholder')"
            @update:model-value="updateField(index, 'otherPackage', $event)"
          />
        </UFormField>
        <UFormField
          :label="t('modules.store.install_dialog.config_label')"
          :hint="t('modules.store.install_dialog.config_hint')"
          :error="errorText(group.errors.config)"
        >
          <UTextarea
            :id="fieldId(index, 'config')"
            :model-value="group.draft.config"
            class="w-full font-mono text-xs"
            :rows="CONFIG_ROWS"
            autoresize
            spellcheck="false"
            :placeholder="CONFIG_PLACEHOLDER"
            @update:model-value="updateField(index, 'config', $event)"
          />
        </UFormField>
      </template>
    </section>
    <p class="text-muted text-xs">
      {{ t("modules.store.install_dialog.note") }}
    </p>
  </div>
</template>
