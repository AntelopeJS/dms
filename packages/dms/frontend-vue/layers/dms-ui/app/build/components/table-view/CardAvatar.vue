<script setup lang="ts">
import { computed, watch } from "vue";
import { useFileReadUrls } from "../../../composables/useFileReadUrls";

/**
 * The leading tile of a built-in card: the row's avatar when its title column
 * declares one (an image value, read through the file API, or a URL), else
 * the initials of its title.
 */
interface CardAvatarProps {
  avatar?: { key: string } | string;
  /** File storage the avatar's key lives in. */
  storage?: string;
  /** The card's title, whose initials stand in for a missing avatar. */
  label: string;
}

const props = defineProps<CardAvatarProps>();

const INITIALS_LENGTH = 2;

const { getUrl, resolve } = useFileReadUrls(props.storage);

const avatarKey = computed(() =>
  props.avatar && typeof props.avatar === "object" ? props.avatar.key : null,
);
watch(avatarKey, (key) => key && resolve(key), { immediate: true });

const src = computed(() => {
  if (typeof props.avatar === "string") return props.avatar;
  return avatarKey.value ? getUrl(avatarKey.value) : undefined;
});

const initials = computed(() =>
  props.label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((word) => word.charAt(0).toUpperCase())
    .join(""),
);
</script>

<template>
  <UAvatar
    v-if="src"
    :src="src"
    :alt="props.label"
    :text="initials"
    size="sm"
    class="size-7 shrink-0 rounded-[7px]"
  />
  <span
    v-else
    class="bg-accented text-default grid size-7 shrink-0 place-items-center rounded-[7px] font-mono text-[10.5px] font-bold"
  >
    {{ initials }}
  </span>
</template>
