import { watch } from "vue";
import { MOCKUPS_PATH } from "./header-action";
import {
  CREATED_ENDPOINT,
  type CreatedMockup,
  type CreatedStream,
  openCreatedStream,
  reactionTo,
} from "./created-mockups";

const TOAST_ICON = "i-ph-frame-corners-light";

/** The page the mockup viewer and the Mockups list embed to draw a mockup, once per page or card. */
const BLOCK_PREVIEW_PATH = "/dms-preview";

/**
 * Dev only, platform owner only: a mockup that gets created opens by itself
 * when the owner is on the Mockups page, which is where "New mockup" starts the
 * assistant, and is offered in a toast anywhere else. A `/dms-preview`
 * document opens no stream: the Overview draws ten of them at once, and a
 * stream each would hold every connection the browser opens to the host.
 */
export default defineDmsPlugin(() => {
  const baseURL = useDmsRuntimeConfig().public.dms?.baseURL?.replace(
    /\/+$/,
    "",
  );
  const route = useDmsRoute();
  if (!baseURL || route.path === BLOCK_PREVIEW_PATH) return;
  const isOwner = useIsOwner();
  const router = useDmsRouter();
  const toast = useToast();
  const { t } = getAppTranslation();

  async function handle(created: CreatedMockup): Promise<void> {
    const reaction = reactionTo(created, route.path, MOCKUPS_PATH);
    if (reaction.kind === "navigate") {
      await router.push(reaction.path);
      return;
    }
    toast.add({
      icon: TOAST_ICON,
      title: t("mockups.created.title", { title: reaction.title }),
      actions: [
        {
          label: t("mockups.created.open"),
          onClick: () => void router.push(reaction.path),
        },
      ],
    });
  }

  let stream: CreatedStream | undefined;
  watch(
    isOwner,
    (owner) => {
      stream?.close();
      stream = owner
        ? openCreatedStream(
            `${baseURL}${CREATED_ENDPOINT}`,
            (created) => void handle(created),
          )
        : undefined;
    },
    { immediate: true },
  );

  if (import.meta.hot) import.meta.hot.dispose(() => stream?.close());
});
