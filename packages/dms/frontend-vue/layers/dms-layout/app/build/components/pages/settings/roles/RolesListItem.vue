<script setup lang="ts">
import { tv } from "tailwind-variants";

interface RolesListItemProps {
  name: string;
  isActive: boolean;
  memberCount: number;
  /** Share of the permission tree the role grants, in percent. */
  coverage: number;
  summary: string;
  inviteCount?: number;
  /** The Owner entry: every permission, not editable. */
  isLocked?: boolean;
  /** A role being created, not saved yet. */
  isDraft?: boolean;
}

const props = withDefaults(defineProps<RolesListItemProps>(), {
  inviteCount: 0,
  isLocked: false,
  isDraft: false,
});

const emit = defineEmits<{ select: [] }>();
const { t } = useI18n();

// v2 .cs-ritem: name and members on one line, the coverage bar below; the
// active role gets the accent tint and a 2px accent edge.
const theme = tv({
  slots: {
    root: "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 border-t border-muted py-3 ps-4 pe-3.5 text-start transition-colors first:border-t-0 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--dms-accent-line)",
    name: "flex min-w-0 items-center gap-[7px] text-[13px] font-semibold text-highlighted",
    members:
      "flex items-center gap-1.5 font-mono text-[11px] font-medium text-muted",
    sum: "col-span-full flex items-center gap-2 font-mono text-[11px] font-medium text-dimmed",
  },
  variants: {
    isActive: {
      true: {
        root: "bg-(--dms-accent-tint) shadow-[inset_2px_0_0_var(--dms-accent)] hover:bg-(--dms-accent-tint)",
      },
    },
    isEmpty: { true: { members: "text-dimmed" } },
    isDraft: { true: { name: "italic text-muted" } },
  },
});

const ui = computed(() =>
  theme({
    isActive: props.isActive,
    isEmpty: props.memberCount === 0,
    isDraft: props.isDraft,
  }),
);
</script>

<template>
  <button
    type="button"
    role="option"
    :aria-selected="props.isActive"
    :class="ui.root()"
    @click="emit('select')"
  >
    <span :class="ui.name()">
      <span class="truncate">{{ props.name }}</span>
      <UIcon
        v-if="props.isLocked"
        name="i-ph-lock-simple"
        class="text-dimmed size-3.5 shrink-0"
      />
      <UBadge
        v-if="props.inviteCount > 0"
        size="sm"
        color="neutral"
        variant="subtle"
        :label="t('page.settings.roles.editor.invites', props.inviteCount)"
      />
    </span>
    <span v-if="!props.isDraft" :class="ui.members()">
      <slot name="avatars" />
      {{ props.memberCount }}
    </span>
    <span :class="ui.sum()">
      <DmsMeter
        as="span"
        size="xs"
        class="flex-1"
        :value="props.coverage"
        :tone="props.isLocked ? 'soft' : 'accent'"
      />
      {{ props.summary }}
    </span>
  </button>
</template>
