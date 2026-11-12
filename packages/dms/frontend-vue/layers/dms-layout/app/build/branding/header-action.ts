import { installBrandingMessages } from "./messages";

export const BRANDING_ACTION_ID = "dms-branding";
export const BRANDING_PATH = "/branding";

/**
 * Dev only: the header icon that opens the Branding editor, shown to the
 * platform owner alone, the one the `/api/branding` routes answer.
 */
export default defineDmsPlugin(({ $i18n }) => {
  installBrandingMessages($i18n);
  const isOwner = useIsOwner();
  const router = useDmsRouter();
  registerHeaderAction({
    id: BRANDING_ACTION_ID,
    icon: "i-ph-paint-brush-light",
    label: "$branding.header.open",
    order: 91,
    isVisible: () => isOwner.value,
    onSelect: () => void router.push(BRANDING_PATH),
  });
});
