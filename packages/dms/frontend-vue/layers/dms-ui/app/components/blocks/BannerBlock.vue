<script setup lang="ts">
import { computed, ref } from "vue";
import DmsBanner from "../banner/Banner.vue";
import DmsBlockActions, { type BlockAction } from "./BlockActions.vue";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

type BannerTone = "info" | "success" | "warning" | "error" | "primary";

// `Banner` block (interface-dms `base/banner`): the v2 notice banner placed
// on a page, with link actions and an optional dismiss that is remembered.
// Dismissals live in a cookie (like the dashboard banners) so the server
// render already leaves a dismissed banner out instead of flashing it.
interface BannerBlockProps extends Partial<DefaultComponentProps> {
  title?: string;
  description?: string;
  tone?: BannerTone;
  /** Overrides the tone's icon. */
  icon?: string;
  /** `md` boxed banner, `sm` compact one-line banner. */
  size?: "sm" | "md";
  actions?: BlockAction[];
  dismissible?: boolean;
  /**
   * Remembers the dismissal under this key; change it to show the banner
   * again. Defaults to the block's position on its page.
   */
  dismissKey?: string;
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
});

const DISMISSED_COOKIE = "dms-dismissed-blocks";
const DISMISSED_MAX_AGE_S = 60 * 60 * 24 * 365;
// Keeps the cookie well under the 4 KB limit; the oldest dismissals go first.
const DISMISSED_MAX_KEYS = 40;

const TONE_ICONS: Record<BannerTone, string> = {
  info: "i-ph-info",
  success: "i-ph-check-circle",
  warning: "i-ph-warning",
  error: "i-ph-warning-circle",
  primary: "i-ph-sparkle",
};

const { processI18n } = useTranslation();
const dismissed = useDmsCookie<string[]>(DISMISSED_COOKIE, {
  default: () => [],
  maxAge: DISMISSED_MAX_AGE_S,
  sameSite: "lax",
});
const isClosed = ref(false);

const storageKey = computed(
  () =>
    props.dismissKey ||
    [props.pageId, props.componentId].filter(Boolean).join(":"),
);
const isVisible = computed(
  () =>
    !isClosed.value &&
    !(
      props.dismissible &&
      storageKey.value &&
      dismissed.value.includes(storageKey.value)
    ),
);
const isCompact = computed(() => props.size === "sm");

function dismiss(): void {
  isClosed.value = true;
  const key = storageKey.value;
  if (!key || dismissed.value.includes(key)) return;
  dismissed.value = [...dismissed.value, key].slice(-DISMISSED_MAX_KEYS);
}
</script>

<template>
  <DmsBanner
    v-if="isVisible"
    :title="props.title ? processI18n(props.title) : undefined"
    :description="
      props.description ? processI18n(props.description) : undefined
    "
    :icon="props.icon ?? TONE_ICONS[props.tone]"
    :color="props.tone"
    :size="props.size"
    :dismissible="props.dismissible"
    @dismiss="dismiss"
  >
    <template v-if="props.actions.length" #actions>
      <DmsBlockActions
        :actions="props.actions"
        :size="isCompact ? 'xs' : 'sm'"
        lead-position="last"
        :lead-variant="isCompact ? 'ghost' : 'solid'"
        :lead-color="
          isCompact ? 'neutral' : props.tone === 'error' ? 'error' : 'primary'
        "
        :rest-variant="isCompact ? 'ghost' : 'outline'"
      />
    </template>
  </DmsBanner>
</template>
