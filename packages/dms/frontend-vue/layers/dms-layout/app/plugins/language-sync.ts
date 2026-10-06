import { watch } from "vue";

export default defineDmsPlugin((dmsApp) => {
  const { user } = useUserSession();
  const { setLocale } = dmsApp.$i18n;

  // Follows the user's language from then on: picked on the Language &
  // region page, it applies as soon as the session is read again.
  dmsApp.hook("app:mounted", () => {
    watch(
      () => user.value?.language,
      (language) => {
        if (language) setLocale(language as "en" | "fr");
      },
      { immediate: true },
    );
  });
});
