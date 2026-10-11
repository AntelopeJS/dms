<script setup lang="ts">
import { computed, useId } from "vue";
import {
  type FormSectionLayout,
  type FormSectionNavGroup,
  type FormSectionState,
  groupSectionsForNav,
} from "../../composables/form/formSections";
import DmsEyebrow from "../../../components/section-header/Eyebrow.vue";

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

/**
 * How the entries are laid out: the side list, the row of chips, or the
 * chips cut into labelled runs once a section names a `navGroup`.
 */
type FormSectionNavLayout = FormSectionNavVariant | "chipGroups";

// A row of chips with no group keeps its one scrolling line; with groups, the
// runs wrap, each led by its label.
const GROUPS_CLASSES: Record<FormSectionNavLayout, string> = {
  list: "flex flex-col gap-4",
  chips: "",
  chipGroups: "flex flex-wrap items-center gap-x-5 gap-y-2.5",
};

const GROUP_CLASSES: Record<FormSectionNavLayout, string> = {
  list: "grid gap-1",
  chips: "contents",
  chipGroups: "flex flex-wrap items-center gap-x-2 gap-y-1.5",
};

const LIST_CLASSES: Record<FormSectionNavLayout, string> = {
  list: "flex flex-col gap-0.5",
  chips: "flex gap-1.5 overflow-x-auto pb-1",
  chipGroups: "flex flex-wrap gap-1.5",
};

const GROUP_LABEL_CLASSES: Record<FormSectionNavLayout, string> = {
  list: "px-2.5",
  chips: "",
  chipGroups: "shrink-0",
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

const groupIdPrefix = useId();
const groups = computed<FormSectionNavGroup[]>(() =>
  groupSectionsForNav(props.sections),
);
const layout = computed<FormSectionNavLayout>(() =>
  props.variant === "chips" && groups.value.some((group) => group.label)
    ? "chipGroups"
    : props.variant,
);

function groupHeadingId(index: number): string {
  return `${groupIdPrefix}-group-${index}`;
}

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
  <nav :aria-label="t('dms.form.sections.nav')" :class="GROUPS_CLASSES[layout]">
    <div
      v-for="(group, groupIndex) in groups"
      :key="group.sections[0]?.id ?? groupIndex"
      :class="GROUP_CLASSES[layout]"
    >
      <DmsEyebrow
        v-if="group.label"
        :id="groupHeadingId(groupIndex)"
        :label="processI18n(group.label)"
        :class="GROUP_LABEL_CLASSES[layout]"
      />
      <ul
        :class="LIST_CLASSES[layout]"
        :aria-labelledby="group.label ? groupHeadingId(groupIndex) : undefined"
      >
        <li v-for="section in group.sections" :key="section.id">
          <a
            :href="`#${props.anchorId(section.id)}`"
            :class="[
              ITEM_CLASSES[props.variant],
              section.id === props.activeId && ACTIVE_CLASSES[props.variant],
            ]"
            :aria-current="
              section.id === props.activeId ? 'location' : undefined
            "
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
    </div>
  </nav>
</template>
