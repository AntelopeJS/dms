import { usePermissionPreview } from "#dms-core/app/entries/composables/auth/usePermissionPreview";
import { PERMISSION_PREVIEW_PENDING_ATTRIBUTE } from "#dms-core/app/entries/utils/permission-preview";

/** The page shows again: the pre-paint hold of a preview tab is over. */
function releasePrePaintHold(): void {
  document.documentElement.removeAttribute(
    PERMISSION_PREVIEW_PENDING_ATTRIBUTE,
  );
}

export default defineDmsPlugin(() => {
  const preview = usePermissionPreview();
  if (!preview.activate()) {
    releasePrePaintHold();
    return;
  }
  const route = useDmsRoute();
  let isFirstRefresh = true;
  watch(
    [() => route.path, () => preview.session.value?.permissions],
    ([path]) => {
      const refresh = preview.refresh(path);
      if (!isFirstRefresh) return;
      isFirstRefresh = false;
      void refresh.finally(() => nextTick(releasePrePaintHold));
    },
    { immediate: true },
  );
});
