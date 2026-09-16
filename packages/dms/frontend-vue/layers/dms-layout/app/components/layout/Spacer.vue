<script lang="ts" setup>
interface SpacerProps {
  minSize?: string;
  maxSize?: string;
  grow?: number;
}

const props = withDefaults(defineProps<SpacerProps>(), {
  minSize: undefined,
  maxSize: undefined,
  grow: 1,
});
</script>

<template>
  <div
    :style="{
      flexGrow: props.grow,
      flexShrink: 1,
      flexBasis: 'auto',
      minWidth: props.minSize,
      maxWidth: props.maxSize,
      minHeight: props.minSize,
      maxHeight: props.maxSize,
    }"
    class="dms-spacer"
  />
</template>
