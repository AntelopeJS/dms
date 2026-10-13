import {
  type LayoutBannerContent,
  type LayoutBannerContext,
  LayoutBannerVariant,
  RegisterLayoutBanner,
} from "@antelopejs/interface-dms/layout-banners";

export const LAYOUT_BANNERS_PAGE_URL = "/layout-banners";
const TENANCY_PAGE_URL = "/tenancy";
const PAST_DUE_AMOUNT_CENTS = 2900;
const PAST_DUE_CURRENCY = "EUR";
const RETRY_IN_DAYS = 3;
const DAY_MS = 86_400_000;

/** The banners a visitor switches on from the layout banners page. */
export const BANNER_KEYS = ["info", "past-due", "component"] as const;
export type BannerKey = (typeof BANNER_KEYS)[number];

// Per tenant, the banners switched on. Every resolver below reads it.
const shownBanners = new Map<BannerKey, Set<string>>(
  BANNER_KEYS.map((key) => [key, new Set<string>()]),
);

export function isBannerShown(key: BannerKey, tenantId: string): boolean {
  return shownBanners.get(key)?.has(tenantId) ?? false;
}

export function toggleBanner(key: BannerKey, tenantId: string): boolean {
  const tenants = shownBanners.get(key);
  if (!tenants) return false;
  const shown = !tenants.has(tenantId);
  if (shown) {
    tenants.add(tenantId);
  } else {
    tenants.delete(tenantId);
  }
  return shown;
}

function pastDueContent({
  tenantId,
}: LayoutBannerContext): LayoutBannerContent | undefined {
  if (!isBannerShown("past-due", tenantId)) return undefined;
  return {
    text: {
      key: "demo.pages.banners.past_due",
      params: {
        amount: {
          type: "money",
          value: PAST_DUE_AMOUNT_CENTS,
          currency: PAST_DUE_CURRENCY,
        },
        date: {
          type: "date",
          value: Date.now() + RETRY_IN_DAYS * DAY_MS,
          format: "day",
        },
      },
    },
    actions: [
      { label: "$demo.pages.banners.pay", to: LAYOUT_BANNERS_PAGE_URL },
    ],
  };
}

// A text banner: fixed message and link, shown while switched on.
RegisterLayoutBanner({
  key: "playground:info",
  variant: LayoutBannerVariant.INFO,
  dismissible: true,
  order: 0,
  text: "$demo.pages.banners.info",
  actions: [{ label: "$demo.pages.banners.open", to: LAYOUT_BANNERS_PAGE_URL }],
  visible: ({ tenantId }) => isBannerShown("info", tenantId),
});

// A resolved banner: visibility and message built in one read per request.
RegisterLayoutBanner({
  key: "playground:past-due",
  variant: LayoutBannerVariant.ERROR,
  order: 10,
  resolve: pastDueContent,
});

// A component banner, also shown while the tenant access gate refuses the
// workspace (switch it on the Tenancy page).
RegisterLayoutBanner({
  key: "playground:suspended",
  variant: LayoutBannerVariant.WARNING,
  order: 20,
  component: "PlaygroundSuspendedBanner",
  props: { to: TENANCY_PAGE_URL },
  visible: ({ tenantId, isTenantAccessDenied }) =>
    isTenantAccessDenied || isBannerShown("component", tenantId),
});
