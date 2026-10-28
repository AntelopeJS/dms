import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
import { FormEvents } from "#dms-ui/app/composables/form/types/events";
import type { ComponentEventData } from "#dms-core/app/types/component";

interface FormSubmitSuccessPayload {
  submitUrl?: string;
}

const REGION_PREFERENCES_ROUTE = pageRoutePath(
  "/settings/user/region",
  "/preferences",
);

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
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DOM listener inference yields Event, not the form publisher's CustomEvent. The existing unchecked projection tolerates a missing detail; an instanceof guard would change acceptance of structural events.
    const detail = (event as CustomEvent<ComponentEventData>).detail;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- ComponentEventData leaves data unknown. This historical optional projection does not validate the payload; requiring a schema would change malformed-event behavior.
    const payload = detail?.data as FormSubmitSuccessPayload | undefined;
    if (!payload?.submitUrl || !SESSION_FORM_ROUTES.has(payload.submitUrl)) {
      return;
    }
    void refresh().catch(() => undefined);
  });
});
