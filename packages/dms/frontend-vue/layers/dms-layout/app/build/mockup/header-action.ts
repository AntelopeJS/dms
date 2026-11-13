import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "#dms-core/app/utils/type-check";

export const EDIT_AS_MOCKUP_ACTION_ID = "dms-edit-as-mockup";

/** Before Mockups (90) and Branding (91), the other dev tools of the header. */
export const EDIT_AS_MOCKUP_ORDER = 89;

const FROM_PAGE_ENDPOINT = "/api/mockup/from-page";
const HTTP_CONFLICT = 409;

/** The stale warning stays until closed: it is the only sign the mockup is behind its page. */
const STALE_TOAST_DURATION_MS = 60 * 60 * 1000;

const DEV_TOOL_PATHS = ["/mockup", "/mockups", "/dms-preview", "/branding"];

interface FromPageAnswer {
  url: string;
  stale: boolean;
  /** The digest of the mockup's spec, which converting again sends back. */
  digest?: string;
}

function parseFromPageAnswer(
  value: Parameters<typeof isObject>[0],
): FromPageAnswer | undefined {
  if (!isObject(value) || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { url, stale, digest } = value;
  if (!isString(url)) return undefined;
  return {
    url,
    stale: isBoolean(stale) && stale,
    digest: isString(digest) ? digest : undefined,
  };
}

/** Whether the backend refused because the mockup's spec changed since it was read. */
function isConflict(error: Parameters<typeof isObject>[0]): boolean {
  if (!isObject(error) || error === null) return false;
  const response = isObject(error.response) ? error.response : {};
  return (
    [error.status, error.statusCode, response.status].find(isNumber) ===
    HTTP_CONFLICT
  );
}

function isDevToolPath(path: string): boolean {
  return DEV_TOOL_PATHS.some(
    (tool) => path === tool || path.startsWith(`${tool}/`),
  );
}

/**
 * Dev only: the header icon that turns the page on screen into a mockup and
 * opens it in Edit mode, with Real data on. The backend picks the mockup and
 * builds the URL; a page whose mockup is older than the page offers to
 * convert it again. Shown to the platform owner alone, the one the
 * `/api/mockup` routes answer.
 */
export default defineDmsPlugin(() => {
  const isOwner = useIsOwner();
  const route = useDmsRoute();
  const router = useDmsRouter();
  const siteLayout = useSiteLayout();
  const { $authFetch } = useAuthFetch();
  const toast = useToast();
  const { t } = getAppTranslation();
  const { presentError } = useApiErrorPresenter();

  async function convert(
    path: string,
    replace?: { digest: string },
  ): Promise<void> {
    try {
      const answer = parseFromPageAnswer(
        await $authFetch(FROM_PAGE_ENDPOINT, {
          method: "POST",
          body: replace
            ? { path, replace: true, digest: replace.digest }
            : { path },
        }),
      );
      if (!answer) throw new Error("Unexpected answer from the mockup API");
      await router.push(answer.url);
      const { digest } = answer;
      if (!answer.stale || digest === undefined) return;
      toast.add({
        color: "warning",
        title: t("editAsMockup.stale"),
        description: t("editAsMockup.staleDescription"),
        duration: STALE_TOAST_DURATION_MS,
        actions: [
          {
            label: t("editAsMockup.convertAgain"),
            onClick: () => void convert(path, { digest }),
          },
        ],
      });
    } catch (error) {
      presentError(error, {
        fallbackKey: isConflict(error)
          ? "editAsMockup.conflict"
          : "editAsMockup.failed",
      });
    }
  }

  registerHeaderAction({
    id: EDIT_AS_MOCKUP_ACTION_ID,
    icon: "i-ph-pencil-simple-line-light",
    label: "$editAsMockup.label",
    order: EDIT_AS_MOCKUP_ORDER,
    isVisible: () =>
      isOwner.value &&
      !isDevToolPath(route.path) &&
      siteLayout.findMatchingRoute(route.path) !== null,
    onSelect: () => void convert(route.path),
  });
});
