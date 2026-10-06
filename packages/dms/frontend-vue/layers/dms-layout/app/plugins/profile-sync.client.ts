import { FormEvents } from "#dms-ui/app/composables/form/types/events";
import type { ComponentEventData } from "#dms-core/app/types/component";

interface FormSubmitSuccessPayload {
  submitUrl?: string;
}

const REGION_PREFERENCES_ROUTE = "/settings/user/region/preferences";

/** The forms that edit the signed-in user's own record. */
const SESSION_FORM_ROUTES = new Set([PROFILE_ROUTE, REGION_PREFERENCES_ROUTE]);

/**
 * Keeps the global user identity in sync with the forms that edit it: when
 * the profile or the Language & region form saves, the session user is read
 * again, so the header menu shows the new name and the language and the
 * regional formats follow at once.
 */
export default defineDmsPlugin(() => {
  const { refresh } = useCurrentUser();

  window.addEventListener(FormEvents.SUBMIT_SUCCESS, (event) => {
    const detail = (event as CustomEvent<ComponentEventData>).detail;
    const payload = detail?.data as FormSubmitSuccessPayload | undefined;
    if (!payload?.submitUrl || !SESSION_FORM_ROUTES.has(payload.submitUrl)) {
      return;
    }
    void refresh().catch(() => undefined);
  });
});
