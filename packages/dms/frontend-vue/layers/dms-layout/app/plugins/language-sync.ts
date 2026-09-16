export default defineDmsPlugin((dmsApp) => {
  const { user } = useUserSession();
  const { setLocale } = dmsApp.$i18n;

  dmsApp.hook("app:mounted", () => {
    if (user.value?.language) {
      setLocale(user.value.language as "en" | "fr");
    }
  });
});
