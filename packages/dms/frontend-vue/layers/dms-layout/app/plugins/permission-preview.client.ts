import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { PERMISSION_PREVIEW_PENDING_ATTRIBUTE } from "#dms-core/app/build/utils/permission-preview";

/** The page shows again: the pre-paint hold of a preview tab is over. */
function releasePrePaintHold(): void {
  document.documentElement.removeAttribute(
    PERMISSION_PREVIEW_PENDING_ATTRIBUTE,
  );
}

// "Preview as role": a tab the roles editor opened (or reloaded while being
// one) becomes a preview. Deferred to after mount, so the server-rendered page
// and the first client render agree. From then on every page change and every
// edit the editor pushes asks the server what the role would lose. The page,
// held back by the pre-paint script meanwhile, shows once the first answer
// has veiled it.
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
