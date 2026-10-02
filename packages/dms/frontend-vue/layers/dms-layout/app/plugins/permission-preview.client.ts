import { usePermissionPreview } from "#dms-core/app/composables/auth/usePermissionPreview";

// "Preview as role": a tab the roles editor opened (or reloaded while being
// one) becomes a preview. Deferred to after mount, so the server-rendered page
// and the first client render agree. From then on every page change and every
// edit the editor pushes asks the server what the role would lose.
export default defineDmsPlugin(() => {
  const preview = usePermissionPreview();
  if (!preview.activate()) return;
  const route = useDmsRoute();
  watch(
    [() => route.path, () => preview.session.value?.permissions],
    ([path]) => {
      void preview.refresh(path);
    },
    { immediate: true },
  );
});
