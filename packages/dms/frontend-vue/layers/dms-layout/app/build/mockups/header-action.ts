export const MOCKUPS_ACTION_ID = "dms-mockups";
export const MOCKUPS_PATH = "/mockups";

/**
 * Dev only: the header icon that opens the Mockups page, shown to the
 * platform owner alone.
 */
export default defineDmsPlugin(() => {
  const isOwner = useIsOwner();
  const router = useDmsRouter();
  registerHeaderAction({
    id: MOCKUPS_ACTION_ID,
    icon: "i-ph-frame-corners-light",
    label: "$mockups.header.open",
    order: 90,
    isVisible: () => isOwner.value,
    onSelect: () => void router.push(MOCKUPS_PATH),
  });
});
