import { FormEvents } from "#dms-ui/app/composables/form/types/events";
import type { ComponentEventData } from "#dms-core/app/types/component";

interface FormSubmitSuccessPayload {
  submitUrl?: string;
}

/**
 * Keeps the global user identity in sync with the profile form: when the
 * profile page's form saves successfully, refresh the session user so the
 * header menu and the switch-account page pick up the new name immediately.
 */
export default defineDmsPlugin(() => {
  const { refresh } = useCurrentUser();

  window.addEventListener(FormEvents.SUBMIT_SUCCESS, (event) => {
    const detail = (event as CustomEvent<ComponentEventData>).detail;
    const payload = detail?.data as FormSubmitSuccessPayload | undefined;
    if (payload?.submitUrl !== PROFILE_ROUTE) {
      return;
    }
    void refresh().catch(() => undefined);
  });
});
