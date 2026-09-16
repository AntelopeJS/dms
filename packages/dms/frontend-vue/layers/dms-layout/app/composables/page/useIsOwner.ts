import type { ComputedRef } from "vue";

export const useIsOwner = (): ComputedRef<boolean> => {
  const { isOwner } = useSiteLayout();
  return computed(() => isOwner.value === true);
};
