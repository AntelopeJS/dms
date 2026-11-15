import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
import { FormEvents } from "#dms-ui/app/composables/form/types/events";
import { submittedUrlOf } from "../build/utils/submittedUrl";

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
    const submitUrl = submittedUrlOf(event);
    if (!submitUrl || !SESSION_FORM_ROUTES.has(submitUrl)) return;
    void refresh().catch(() => undefined);
  });
});
