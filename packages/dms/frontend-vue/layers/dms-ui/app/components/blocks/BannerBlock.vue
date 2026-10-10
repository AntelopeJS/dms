<script setup lang="ts">
import { computed, ref } from "vue";
import DmsBanner from "../banner/Banner.vue";
import DmsBlockActions, {
  type BlockActionItem,
  type BlockButtonAction,
} from "../../build/components/blocks/BlockActions.vue";
import { useActionTargets } from "../../build/composables/actions/useActionTargets";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { refreshPageBlocks } from "../../utils/blockRefresh";
import type { CustomButton } from "../../composables/table-view/types/custom-button";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockText } from "../../../../dms-core/app/types/composed-text";

type BannerTone = "info" | "success" | "warning" | "error" | "primary";

/** What a banner shows (interface-dms `BannerContent`). */
interface BannerContent {
  /** A string (`$` for an i18n key) or a composed text. */
  title?: BlockText;
  description?: BlockText;
  tone?: BannerTone;
  /** Overrides the tone's icon. */
  icon?: string;
  /** `md` boxed banner, `sm` compact one-line banner. */
  size?: "sm" | "md";
  /** Links, and buttons running a target when a route answers them. */
  actions?: BlockActionItem[];
  dismissible?: boolean;
  /**
   * Remembers the dismissal under this key; change it to show the banner
   * again. Defaults to the block's id on its page.
   */
  dismissKey?: string;
}

/** The content drawn: the fetched fields over the options. */
interface ResolvedBanner extends BannerContent {
  tone: BannerTone;
  size: "sm" | "md";
  actions: BlockActionItem[];
}

// `Banner` block (interface-dms `base/banner`): the v2 notice banner placed
// on a page, with actions and an optional dismiss that is remembered.
// Dismissals live in a cookie (like the dashboard banners) so the server
// render already leaves a dismissed banner out instead of flashing it. With a
// `fetchUrl` the route answers the content, or nothing for no banner.
interface BannerBlockProps
  extends Partial<DefaultComponentProps>,
    BannerContent {
  /** Route answering a `BannerContent`, or `null` / `{}` / 204 to hide. */
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
}

const props = withDefaults(defineProps<BannerBlockProps>(), {
  title: undefined,
  description: undefined,
  tone: "info",
  icon: undefined,
  size: "md",
  actions: () => [],
  dismissible: false,
  dismissKey: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  periodScope: undefined,
  realtimeTopic: undefined,
});

const DISMISSED_COOKIE = "dms-dismissed-blocks";
const DISMISSED_MAX_AGE_S = 60 * 60 * 24 * 365;
// Keeps the cookie well under the 4 KB limit; the oldest dismissals go first.
const DISMISSED_MAX_KEYS = 40;

// Keys the actions' drawers and modals are opened under, for a banner placed
// outside a page (a preview).
const FALLBACK_COMPONENT_ID = "banner";
const FALLBACK_PAGE_ID = "page";

const TONE_ICONS: Record<BannerTone, string> = {
  info: "i-ph-info",
  success: "i-ph-check-circle",
  warning: "i-ph-warning",
  error: "i-ph-warning-circle",
  primary: "i-ph-sparkle",
};

const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

const { data } = useChartFetch<BannerContent | null>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  periodScope: props.periodScope,
  realtimeTopic: props.realtimeTopic,
  routeParams: () => props.routeParams,
  watchSource: () => JSON.stringify(watchState.value),
});

// A button that changed something changes what the page shows: its blocks,
// this banner included, read their data again.
const { handleCustomButton } = useActionTargets({
  api: useAuthFetch().$authFetch,
  componentId: props.componentId ?? FALLBACK_COMPONENT_ID,
  pageId: props.pageId ?? FALLBACK_PAGE_ID,
  refreshCallback: refreshPageBlocks,
  handleApiError: (error, title) => useApiError(error, { title }),
});

// A fetched banner is an alert: it draws nothing until its route answered
// something (a skeleton would flash a banner that may not exist), and nothing
// when the answer is empty.
const hasFetchedContent = computed(
  () => Boolean(data.value) && Object.keys(data.value as object).length > 0,
);

// Field by field, the route's answer over the options.
const banner = computed<ResolvedBanner>(() => {
  const fetched: BannerContent = data.value ?? {};
  return {
    title: fetched.title ?? props.title,
    description: fetched.description ?? props.description,
    tone: fetched.tone ?? props.tone,
    icon: fetched.icon ?? props.icon,
    size: fetched.size ?? props.size,
    actions: fetched.actions ?? props.actions,
    dismissible: fetched.dismissible ?? props.dismissible,
    dismissKey: fetched.dismissKey ?? props.dismissKey,
  };
});

const { processText } = useComposedText();
const dismissed = useDmsCookie<string[]>(DISMISSED_COOKIE, {
  default: () => [],
  maxAge: DISMISSED_MAX_AGE_S,
  sameSite: "lax",
});
const isClosed = ref(false);

const storageKey = computed(
  () =>
    banner.value.dismissKey ||
    [props.pageId, props.componentId].filter(Boolean).join(":"),
);
const isDismissed = computed(
  () =>
    isClosed.value ||
    Boolean(
      banner.value.dismissible &&
        storageKey.value &&
        dismissed.value.includes(storageKey.value),
    ),
);
const isVisible = computed(
  () => !isDismissed.value && (!props.fetchUrl || hasFetchedContent.value),
);
const isCompact = computed(() => banner.value.size === "sm");

function dismiss(): void {
  isClosed.value = true;
  const key = storageKey.value;
  if (!key || dismissed.value.includes(key)) return;
  dismissed.value = [...dismissed.value, key].slice(-DISMISSED_MAX_KEYS);
}

function press(action: BlockButtonAction): void {
  handleCustomButton(action as CustomButton);
}
</script>

<template>
  <DmsBanner
    v-if="isVisible"
    :title="banner.title ? processText(banner.title) : undefined"
    :description="
      banner.description ? processText(banner.description) : undefined
    "
    :icon="banner.icon ?? TONE_ICONS[banner.tone]"
    :tone="banner.tone"
    :size="banner.size"
    :dismissible="banner.dismissible"
    @dismiss="dismiss"
  >
    <template v-if="banner.actions.length" #actions>
      <DmsBlockActions
        :actions="banner.actions"
        :size="isCompact ? 'xs' : 'sm'"
        lead-position="last"
        :lead-variant="isCompact ? 'ghost' : 'solid'"
        :lead-color="
          isCompact ? 'neutral' : banner.tone === 'error' ? 'error' : 'primary'
        "
        :rest-variant="isCompact ? 'ghost' : 'outline'"
        @press="press"
      />
    </template>
  </DmsBanner>
</template>
