<script setup lang="ts">
interface ModuleTileSkeletonProps {
  /**
   * A store tile still to install: no status pill, and the 30px npm package
   * line under the description.
   */
  isStore?: boolean;
}

const props = withDefaults(defineProps<ModuleTileSkeletonProps>(), {
  isStore: false,
});

const { t } = useI18n();
</script>

<template>
  <div
    class="dms-card flex min-h-[228px] flex-col gap-3 overflow-hidden px-4 pt-4"
    aria-hidden="true"
  >
    <div class="flex items-start justify-between gap-2.5">
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        class="size-9 rounded-[10px]"
      />
      <USkeleton
        v-if="!props.isStore"
        :aria-label="t('dms.a11y.loading')"
        class="h-5 w-16 rounded-full"
      />
    </div>

    <div class="flex h-7 items-center">
      <USkeleton :aria-label="t('dms.a11y.loading')" class="h-4 w-2/5" />
    </div>
    <!-- The description's two lines, each its line height tall. -->
    <div class="-mt-1.5 text-sm leading-[1.45]">
      <div class="flex h-[1.45em] items-center">
        <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-full" />
      </div>
      <div class="flex h-[1.45em] items-center">
        <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-3/5" />
      </div>
    </div>

    <USkeleton
      v-if="props.isStore"
      :aria-label="t('dms.a11y.loading')"
      class="h-[30px] rounded-[8px]"
    />

    <div
      class="-mx-4 mt-auto flex items-center justify-between gap-2 border-t border-(--ui-border-muted) bg-(--dms-bg-muted) py-[7px] ps-4 pe-3"
    >
      <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-24" />
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        class="h-6 w-16 rounded-md"
      />
    </div>
  </div>
</template>
