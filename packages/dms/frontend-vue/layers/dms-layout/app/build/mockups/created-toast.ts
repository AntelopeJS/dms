import { watch } from "vue";
import { isPreviewFrame } from "#dms-core/app/entries/utils/previewFrame";
import { MOCKUPS_PATH } from "./header-action";
import {
  CREATED_ENDPOINT,
  type CreatedMockup,
  type CreatedStream,
  openCreatedStream,
  reactionTo,
} from "./created-mockups";

const TOAST_ICON = "i-ph-frame-corners-light";

/**
 * Dev only, platform owner only: a mockup that gets created opens by itself
 * when the owner is on the Mockups page, which is where "New mockup" starts the
 * assistant, and is offered in a toast anywhere else. A preview frame opens
 * no stream (see `isPreviewFrame`).
 */
export default defineDmsPlugin(() => {
  const baseURL = useDmsRuntimeConfig().public.dms?.baseURL?.replace(
    /\/+$/,
    "",
  );
  if (!baseURL || isPreviewFrame()) return;
  const route = useDmsRoute();
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
