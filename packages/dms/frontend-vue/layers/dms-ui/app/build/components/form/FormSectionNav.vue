<script setup lang="ts">
import type {
  FormSectionLayout,
  FormSectionState,
} from "../../composables/form/formSections";

type FormSectionNavVariant = "list" | "chips";

interface FormSectionNavProps {
  sections: FormSectionLayout[];
  states: Record<string, FormSectionState>;
  activeId?: string;
  /** `list`: the side column; `chips`: a row above the sections. */
  variant: FormSectionNavVariant;
  /** DOM id of a section's card, which its entry links to. */
  anchorId: (sectionId: string) => string;
}

const props = defineProps<FormSectionNavProps>();
const emit = defineEmits<{ select: [sectionId: string] }>();
const { t } = useI18n();
const { processI18n } = useTranslation();

const VARIANT_CLASSES: Record<FormSectionNavVariant, string> = {
  list: "flex flex-col gap-0.5",
  chips: "flex gap-1.5 overflow-x-auto pb-1",
};

const ITEM_CLASSES: Record<FormSectionNavVariant, string> = {
  list: "text-muted hover:bg-elevated/60 hover:text-default flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px]",
  chips:
    "border-default text-muted hover:text-default flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px]",
};

const ACTIVE_CLASSES: Record<FormSectionNavVariant, string> = {
  list: "bg-elevated text-highlighted font-[550]",
  chips: "border-accented bg-elevated text-highlighted",
};

function stateLabel(state: FormSectionState | undefined): string | undefined {
  if (state?.invalidCount) {
    const count = state.invalidCount;
    return t("dms.form.sections.invalid", { count }, count);
  }
  return state?.dirty ? t("dms.form.sections.changed") : undefined;
}

function onSelect(event: MouseEvent, sectionId: string): void {
  event.preventDefault();
  emit("select", sectionId);
}
</script>

<template>
  <nav :aria-label="t('dms.form.sections.nav')">
    <ul :class="VARIANT_CLASSES[props.variant]">
      <li v-for="section in props.sections" :key="section.id">
        <a
          :href="`#${props.anchorId(section.id)}`"
          :class="[
            ITEM_CLASSES[props.variant],
            section.id === props.activeId && ACTIVE_CLASSES[props.variant],
          ]"
          :aria-current="section.id === props.activeId ? 'location' : undefined"
          @click="onSelect($event, section.id)"
        >
          <UIcon
            v-if="section.icon && props.variant === 'list'"
            :name="section.icon"
            class="size-4 shrink-0"
          />
          <span class="truncate">{{ processI18n(section.label) }}</span>
          <!-- Read by its sr-only label below, not twice. -->
          <span
            v-if="props.states[section.id]?.invalidCount"
            class="text-error ms-auto inline-flex items-center gap-1 font-mono text-[11px]"
            aria-hidden="true"
          >
            <span class="bg-error size-1.5 rounded-full" aria-hidden="true" />
            {{ props.states[section.id]?.invalidCount }}
          </span>
          <span
            v-else-if="props.states[section.id]?.dirty"
            class="bg-warning ms-auto size-1.5 shrink-0 rounded-full"
            aria-hidden="true"
          />
          <span v-if="stateLabel(props.states[section.id])" class="sr-only">
            {{ stateLabel(props.states[section.id]) }}
          </span>
        </a>
      </li>
    </ul>
  </nav>
</template>
