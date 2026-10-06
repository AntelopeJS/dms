<script setup lang="ts">
import { computed, watch } from "vue";
import { useFileReadUrls } from "../../composables/useFileReadUrls";

/**
 * The `identity` cell of a table: an avatar (or an icon tile), a name with an
 * optional "You" tag and status badges, and a secondary line (an address).
 * Rendered by the `identity` data type, which reads the extras off the row.
 */
interface IdentityCellBadge {
  label: string;
  /** Badge color (Nuxt UI color name). Defaults to `neutral`. */
  color?: string;
}

interface IdentityCellProps {
  /** Main line; the subtitle takes its place when empty. */
  title?: string;
  /** Secondary line under the title. */
  subtitle?: string;
  /** Image value (`{ key }`, resolved through the file API) or a URL. */
  avatar?: { key: string; alt?: string } | string | null;
  /** Icon drawn in a tile instead of an avatar. */
  icon?: string;
  /** User id the row stands for: the signed-in user's row gets `selfLabel`. */
  selfId?: string;
  /** Tag of the signed-in user's row. */
  selfLabel?: string;
  /** Badges after the title. */
  badges?: IdentityCellBadge[];
  /** Storage the avatar's file key lives in. */
  storage?: string;
}

const props = withDefaults(defineProps<IdentityCellProps>(), {
  title: "",
  subtitle: "",
  avatar: null,
  icon: undefined,
  selfId: undefined,
  selfLabel: undefined,
  badges: () => [],
  storage: undefined,
});

const { user } = useCurrentUser();
const { getUrl, resolve } = useFileReadUrls(props.storage);

const MAX_INITIALS = 2;
const INITIALS_SPLIT = /[\s.@_-]+/;

const label = computed(() => props.title || props.subtitle);
const isSelf = computed(
  () => !!props.selfId && props.selfId === user.value?._id,
);

const avatarKey = computed(() =>
  props.avatar && typeof props.avatar === "object" ? props.avatar.key : null,
);
watch(avatarKey, (key) => key && resolve(key), { immediate: true });

const avatarSrc = computed(() => {
  if (typeof props.avatar === "string") return props.avatar || undefined;
  return avatarKey.value ? getUrl(avatarKey.value) : undefined;
});

const initials = computed(() =>
  label.value
    .split(INITIALS_SPLIT)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join(""),
);
</script>

<template>
  <!-- In a narrow column the badges give way first (down to a readable
    ellipsis, the full label in their tooltip), then the name. -->
  <div class="flex min-w-0 items-center gap-2.5">
    <span
      v-if="props.icon"
      class="bg-accented text-toned grid size-7 shrink-0 place-items-center rounded-[7px]"
    >
      <UIcon :name="props.icon" class="size-3.5" />
    </span>
    <UAvatar
      v-else
      :src="avatarSrc"
      :alt="label"
      :text="initials"
      size="sm"
      class="shrink-0"
    />
    <div class="min-w-0">
      <span
        class="text-highlighted flex min-w-0 items-center gap-1.5 leading-[1.3] font-semibold"
      >
        <span class="truncate" :title="label">{{ label }}</span>
        <span
          v-if="isSelf && props.selfLabel"
          class="text-dimmed shrink-0 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase"
        >
          {{ props.selfLabel }}
        </span>
        <UBadge
          v-for="badge in props.badges"
          :key="badge.label"
          :color="(badge.color ?? 'neutral') as 'neutral'"
          variant="soft"
          size="sm"
          :label="badge.label"
          :title="badge.label"
          :ui="{ label: 'truncate' }"
          class="min-w-16 shrink-[3]"
        />
      </span>
      <span
        v-if="props.title && props.subtitle"
        class="text-dimmed block truncate text-xs leading-[1.2]"
      >
        {{ props.subtitle }}
      </span>
    </div>
  </div>
</template>
