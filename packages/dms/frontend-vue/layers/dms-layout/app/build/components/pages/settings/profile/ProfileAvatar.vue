<script setup lang="ts">
interface ProfileAvatarProps {
  name: string;
  src?: string | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<ProfileAvatarProps>(), {
  src: null,
  loading: false,
});

const emit = defineEmits<{
  edit: [];
}>();

const { t } = useI18n();
</script>

<template>
  <!-- v2 .cs-avatar__img: 64px gradient initials ringed by the card, with a
       camera badge that opens the picker. -->
  <div class="relative size-16 shrink-0">
    <UAvatar
      :src="props.src ?? undefined"
      :alt="props.name"
      class="size-16 text-xl shadow-[0_0_0_3px_var(--ui-bg),0_0_0_4px_var(--ui-border-accented)]"
    />
    <span
      v-if="props.loading"
      class="absolute inset-0 grid place-items-center rounded-full bg-(--ui-bg)/60"
    >
      <UIcon
        name="i-ph-circle-notch"
        class="text-highlighted size-5 animate-spin"
      />
    </span>
    <button
      type="button"
      class="bg-elevated border-accented text-toned hover:text-highlighted absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full border shadow-sm transition-colors"
      :aria-label="t('page.settings.profile.avatar_upload')"
      @click="emit('edit')"
    >
      <UIcon name="i-ph-camera" class="size-[13px]" />
    </button>
  </div>
</template>
