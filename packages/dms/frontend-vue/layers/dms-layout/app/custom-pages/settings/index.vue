<script setup lang="ts">
const siteLayout = useSiteLayout();
if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

if (siteLayout.loadingError && siteLayout.loadingError.value) {
  throw createError({
    statusCode: HTTP_INTERNAL_SERVER_ERROR,
    statusMessage: "Error loading site layout",
    message: siteLayout.loadingError.value || "Unknown error occurred",
  });
}

interface SettingsOption {
  name: string;
  description: string;
  icon: string;
  to: string;
}

interface Group {
  groupName: string;
  groupIcon?: string;
  options: SettingsOption[];
}

interface PageWithParent {
  page: typeof siteLayout.siteLayoutTree.value;
  parent: typeof siteLayout.siteLayoutTree.value;
}

interface FindSettingsPagesResult {
  results: PageWithParent[];
  hasSettingsChildren: boolean;
}

function findSettingsPages(
  node: typeof siteLayout.siteLayoutTree.value,
  parent: typeof siteLayout.siteLayoutTree.value | null = null,
): FindSettingsPagesResult {
  if (!node) return { results: [], hasSettingsChildren: false };

  const results: PageWithParent[] = [];
  let hasSettingsChildrenInSubtree = false;

  if (node.children) {
    for (const child of Object.values(node.children)) {
      if (child) {
        const childResult = findSettingsPages(child, node);
        results.push(...childResult.results);
        if (childResult.hasSettingsChildren) {
          hasSettingsChildrenInSubtree = true;
        }
      }
    }
  }

  const isSettingsPage = !!(
    node.layoutUrl &&
    node.fullId.startsWith("settings.") &&
    node.fullId !== "settings.settings"
  );

  if (isSettingsPage) {
    if (parent && node.hasAccess !== false && !hasSettingsChildrenInSubtree) {
      results.push({ page: node, parent });
    }
    hasSettingsChildrenInSubtree = true;
  }

  return { results, hasSettingsChildren: hasSettingsChildrenInSubtree };
}

function buildGroupFromPages(
  parent: NonNullable<typeof siteLayout.siteLayoutTree.value>,
  pages: NonNullable<typeof siteLayout.siteLayoutTree.value>[],
): (Group & { order: number }) | null {
  if (parent.hasAccess === false) return null;

  const sortedPages = pages
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((page) => ({
      name: page.displayName,
      description: page.description || "",
      icon: page.icon || "i-ph-gear",
      to: page.fullSlug,
    }));

  return {
    groupName: parent.displayName,
    groupIcon: parent.icon,
    options: sortedPages,
    order: parent.order ?? 0,
  };
}

const groups = computed<Group[]>(() => {
  if (!siteLayout.siteLayoutTree.value) return [];

  const tree = siteLayout.siteLayoutTree.value;
  if (!tree) return [];

  const { results: pagesWithParents } = findSettingsPages(tree);

  const groupsMap = new Map<
    string,
    { parent: typeof tree; pages: (typeof tree)[] }
  >();

  for (const { page, parent } of pagesWithParents) {
    if (!page || !parent) continue;
    const parentId = parent.fullId;
    if (!groupsMap.has(parentId)) {
      groupsMap.set(parentId, { parent, pages: [] });
    }
    groupsMap.get(parentId)!.pages.push(page);
  }

  return Array.from(groupsMap.values())
    .map(({ parent, pages }) => buildGroupFromPages(parent, pages))
    .filter((item): item is Group & { order: number } => item !== null)
    .sort((a, b) => a.order - b.order)
    .map(({ groupName, groupIcon, options }) => ({
      groupName,
      groupIcon,
      options,
    }));
});

const { processI18n } = useTranslation();
</script>

<template>
  <div class="space-y-8 pb-20">
    <section
      v-for="(group, index) in groups"
      :key="`group-${index}`"
      class="pb-14"
    >
      <h2
        class="text-muted flex items-center gap-2.5 pb-6 text-sm font-medium tracking-wider uppercase"
      >
        <Icon
          v-if="group.groupIcon"
          :name="group.groupIcon"
          class="text-primary size-4.5"
        />
        {{ processI18n(group.groupName) }}
      </h2>

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <DmsNavCard
          v-for="(option, optIndex) in group.options"
          :key="`option-${index}-${optIndex}`"
          :to="option.to"
          :icon="option.icon"
          :title="processI18n(option.name)"
          :description="processI18n(option.description)"
        />
      </div>
    </section>
  </div>
</template>
