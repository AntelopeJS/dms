<script setup lang="ts">
interface Props {
  permission: string;
}

defineProps<Props>();
const { hasPermission, isLoaded } = usePermissions();
</script>

<template>
  <slot v-if="isLoaded && hasPermission(permission)" />
  <slot v-else name="fallback" />
</template>
