<script setup lang="ts">
import { tv } from "tailwind-variants";
import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { useNavBadges } from "#dms-ui/app/build/composables/navigation/useNavBadges";
import { DMS_TONE_SOFT } from "#dms-ui/app/build/utils/tone";
import DmsSearchInput from "#dms-ui/app/build/components/form/SearchInput.vue";
import {
  findActiveSettingsPath,
  useSettingsNavigation,
  type SettingsNavGroup,
  type SettingsNavPage,
} from "../../../../composables/settings/useSettingsNavigation";

const SETTINGS_INDEX_PATH = "/settings";
const ALL_SETTINGS_ICON = "i-ph-squares-four";

// v2 settings nav: title, search, "All settings", then one eyebrow-labelled
// group per scope. Under lg it folds into a horizontal strip of items.
const theme = tv({
  slots: {
    root: "flex gap-1.5 overflow-x-auto no-scrollbar max-lg:-mx-4 max-lg:px-4 lg:grid lg:gap-[18px] lg:overflow-visible",
    title:
      "hidden px-2.5 text-[17px] font-[650] tracking-[-0.03em] text-highlighted lg:block",
    search: "hidden lg:block",
    group: "contents lg:grid lg:gap-px",
    groupLabel:
      "hidden px-2.5 pb-1.5 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-dimmed uppercase lg:block",
    item: "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium whitespace-nowrap text-muted transition-colors hover:bg-elevated hover:text-highlighted max-lg:border max-lg:border-default",
    itemIcon: "size-[17px] shrink-0",
    itemLabel: "min-w-0 truncate",
    trailBadge:
      "ms-auto hidden rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums lg:inline",
    trailDot: "ms-auto hidden size-[7px] shrink-0 rounded-full lg:block",
    empty: "hidden px-2.5 text-[12.5px] text-muted lg:block",
    previewLock: "ms-auto size-3.5 shrink-0",
  },
  variants: {
    active: {
      true: {
        item: "bg-primary/10 font-semibold text-primary hover:bg-primary/10 hover:text-primary max-lg:border-primary/35",
      },
    },
    status: {
      success: { trailDot: "bg-success" },
      warning: { trailDot: "bg-warning" },
      error: { trailDot: "bg-error" },
    },
    // "Preview as role" only, the same hatches as the sidebar's: red for a
    // page the role could not open, orange for one it opens partially.
    previewState: {
      hidden: {
        item: "text-muted dms-hatch-locked",
        previewLock: "text-error",
      },
      partial: {
        item: "dms-hatch-partial",
        previewLock: "text-warning",
      },
    },
  },
});

// Registered id of the settings index ("All settings").
const SETTINGS_INDEX_ID = "settings";

const ui = computed(() => theme());

const { t } = useI18n();
const { processI18n } = useTranslation();
const route = useDmsRoute();
const { groups } = useSettingsNavigation();

const query = ref("");

const matchesQuery = (page: SettingsNavPage, needle: string): boolean =>
  [page.label, page.description].some((text) =>
    processI18n(text).toLocaleLowerCase().includes(needle),
  );

const visibleGroups = computed<SettingsNavGroup[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  if (!needle) return groups.value;
  return groups.value
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => matchesQuery(page, needle)),
    }))
    .filter((group) => group.pages.length > 0);
});

// Only the most specific entry is active: on pending invitations, Members
// (whose path it lies under) is not. Read from every entry, not the searched
// ones, so a search never moves the highlight.
const activePath = computed(() =>
  findActiveSettingsPath(
    route.path,
    groups.value.flatMap((group) => group.pages.map((page) => page.to)),
  ),
);
const isActive = (to: string): boolean => activePath.value === to;

// Under lg the nav is a horizontal strip wider than the screen: the active
// item is centred in it on load and on every page change, so a page late in
// the list (Roles, Member invitations) is not highlighted out of sight.
const navRoot = useTemplateRef<HTMLElement>("navRoot");
function revealActiveItem(): void {
  const root = navRoot.value;
  if (!root || root.scrollWidth <= root.clientWidth) return;
  const item = root.querySelector<HTMLElement>('[aria-current="page"]');
  if (!item) return;
  const itemBox = item.getBoundingClientRect();
  const rootBox = root.getBoundingClientRect();
  root.scrollLeft +=
    itemBox.left - rootBox.left - (root.clientWidth - itemBox.width) / 2;
}
onMounted(revealActiveItem);
watch(() => route.path, revealActiveItem, { flush: "post" });

// The page's badge, counted by the server when the menu loads (`navBadge`)
// or declared, then kept fresh by the page that shows the count; drawn in
// its tone, as a status pill is.
const { navBadgeOf } = useNavBadges();
const badgeOf = (page: SettingsNavPage) => navBadgeOf(page);
const badgeToneClass = (page: SettingsNavPage): string =>
  DMS_TONE_SOFT[badgeOf(page)?.tone ?? "neutral"];

// "Preview as role": a settings page the role could not open stays listed,
// locked, so the preview shows what the role loses; one it opens without all
// of it is drawn partially locked.
const preview = usePermissionPreview();
const PREVIEW_STATE_LABELS = {
  hidden: "page.settings.roles.preview.menu_hidden",
  partial: "page.settings.roles.preview.menu_partial",
} as const;
const previewStateLabel = (
  state: keyof typeof PREVIEW_STATE_LABELS | null,
): string | undefined =>
  state
    ? t(PREVIEW_STATE_LABELS[state], {
        role: preview.session.value?.roleName ?? "",
      })
    : undefined;
</script>

<template>
  <nav ref="navRoot" :class="ui.root()" :aria-label="t('page.settings.title')">
    <h2 :class="ui.title()">{{ t("page.settings.title") }}</h2>

    <!-- "/" belongs to this search on every settings page; a page with a
      search of its own focuses it with ⌘ / or Ctrl / instead, never "/". -->
    <DmsSearchInput
      v-model="query"
      :placeholder="t('page.settings.shell.search_placeholder')"
      shortcut="nav"
      size="sm"
      :class="ui.search()"
    />

    <DmsLink
      :to="SETTINGS_INDEX_PATH"
      :class="
        ui.item({
          active: route.path === SETTINGS_INDEX_PATH,
          previewState: preview.entryState(SETTINGS_INDEX_ID) ?? undefined,
        })
      "
      :aria-current="route.path === SETTINGS_INDEX_PATH ? 'page' : undefined"
    >
      <UIcon :name="ALL_SETTINGS_ICON" :class="ui.itemIcon()" />
      <span :class="ui.itemLabel()">
        {{ t("page.settings.shell.all_settings") }}
      </span>
      <UIcon
        v-if="preview.entryState(SETTINGS_INDEX_ID)"
        name="i-ph-lock-simple"
        :class="
          ui.previewLock({
            previewState: preview.entryState(SETTINGS_INDEX_ID) ?? undefined,
          })
        "
        role="img"
        :aria-label="previewStateLabel(preview.entryState(SETTINGS_INDEX_ID))"
      />
    </DmsLink>

    <div v-for="group in visibleGroups" :key="group.id" :class="ui.group()">
      <span :class="ui.groupLabel()">{{ processI18n(group.label) }}</span>
      <DmsLink
        v-for="page in group.pages"
        :key="page.fullId"
        :to="page.to"
        :class="
          ui.item({
            active: isActive(page.to),
            previewState: preview.entryState(page.fullId) ?? undefined,
          })
        "
        :aria-current="isActive(page.to) ? 'page' : undefined"
      >
        <UIcon :name="page.icon" :class="ui.itemIcon()" />
        <span :class="ui.itemLabel()">{{ processI18n(page.label) }}</span>
        <UIcon
          v-if="preview.entryState(page.fullId)"
          name="i-ph-lock-simple"
          :class="
            ui.previewLock({
              previewState: preview.entryState(page.fullId) ?? undefined,
            })
          "
          role="img"
          :aria-label="previewStateLabel(preview.entryState(page.fullId))"
        />
        <span
          v-else-if="badgeOf(page)"
          :class="ui.trailBadge({ class: badgeToneClass(page) })"
        >
          {{ badgeOf(page)?.label }}
        </span>
        <span
          v-else-if="page.status && page.status !== 'neutral'"
          :class="ui.trailDot({ status: page.status })"
          role="img"
        />
      </DmsLink>
    </div>

    <p v-if="query && visibleGroups.length === 0" :class="ui.empty()">
      {{ t("page.settings.shell.no_results") }}
    </p>
  </nav>
</template>
