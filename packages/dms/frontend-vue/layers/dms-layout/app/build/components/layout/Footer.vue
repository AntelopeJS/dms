<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";

const EXTERNAL_LINK_PATTERN = /^https?:\/\//;
const GITHUB_REPOSITORY = "AntelopeJS/dms";
const GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_REPOSITORY}`;
const GITHUB_REPOSITORY_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
const GITHUB_STARS_CACHE_KEY = "dms-github-stars";
// GitHub allows 60 anonymous API calls an hour per visitor: the count is
// cached for the session and refreshed hourly.
const GITHUB_STARS_CACHE_TTL_MS = 60 * 60 * 1000;

const { locale, setLocale, t } = useI18n();
const { uniqueLocales } = useUniqueLocales();
const { links } = useFooterLinks();

const localesOptions: SelectItem[] = uniqueLocales.value.map((lang) => ({
  label: lang.name,
  value: lang.code,
}));

function isExternal(to: string): boolean {
  return EXTERNAL_LINK_PATTERN.test(to);
}

interface CachedStars {
  count: number;
  fetchedAt: number;
}

const githubStars = ref<number | null>(null);
// The count is fetched after mount: a placeholder holds its place until then,
// and the segment only goes away if no count could be read.
const githubStarsSettled = ref(false);
const formattedGithubStars = computed(() =>
  githubStars.value === null
    ? ""
    : new Intl.NumberFormat(locale.value, { notation: "compact" }).format(
        githubStars.value,
      ),
);

function readCachedStars(): CachedStars | null {
  try {
    const raw = sessionStorage.getItem(GITHUB_STARS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedStars) : null;
  } catch {
    return null;
  }
}

function writeCachedStars(count: number): void {
  try {
    sessionStorage.setItem(
      GITHUB_STARS_CACHE_KEY,
      JSON.stringify({ count, fetchedAt: Date.now() } satisfies CachedStars),
    );
  } catch {
    /* storage unavailable: the count is fetched again next time */
  }
}

// Starring itself happens on GitHub (it needs the visitor's GitHub session);
// the button shows the live count and opens the repository.
async function loadGithubStars(): Promise<void> {
  const cached = readCachedStars();
  if (cached && Date.now() - cached.fetchedAt < GITHUB_STARS_CACHE_TTL_MS) {
    githubStars.value = cached.count;
    return;
  }
  try {
    const response = await fetch(GITHUB_REPOSITORY_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const { stargazers_count: count } = (await response.json()) as {
      stargazers_count?: unknown;
    };
    if (typeof count !== "number") return;
    githubStars.value = count;
    writeCachedStars(count);
  } catch {
    /* offline or rate-limited: the button shows without a count */
  }
}

onMounted(async () => {
  await loadGithubStars();
  githubStarsSettled.value = true;
});

async function onLocaleChange(code: unknown) {
  await setLocale(code as typeof locale.value);
}
</script>

<template>
  <!-- v2 .au-foot: one quiet 12.5px row, the locale switcher pushed right.
       On phones the links get a taller invisible hit area and the star
       button grows to 32px, so each stays easy to tap. -->
  <footer
    class="border-default text-dimmed flex flex-wrap items-center gap-x-[18px] gap-y-1.5 border-t px-5 py-3 text-[12.5px] max-sm:justify-center"
  >
    <span>&copy; Antelope</span>
    <template v-for="link in links" :key="link.id">
      <a
        v-if="isExternal(link.to)"
        :href="link.to"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-highlighted transition-colors max-sm:relative max-sm:after:absolute max-sm:after:-inset-x-1 max-sm:after:-inset-y-1.5 max-sm:after:content-['']"
      >
        {{ t(link.label) }}
      </a>
      <DmsLink
        v-else
        :to="link.to"
        class="hover:text-highlighted transition-colors max-sm:relative max-sm:after:absolute max-sm:after:-inset-x-1 max-sm:after:-inset-y-1.5 max-sm:after:content-['']"
      >
        {{ t(link.label) }}
      </DmsLink>
    </template>

    <!-- GitHub star button: icon + "Star" | live count, opens the repository. -->
    <a
      :href="GITHUB_REPOSITORY_URL"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('empty_layout.footer.github_star_label')"
      :title="t('empty_layout.footer.github_star_label')"
      class="border-default text-muted hover:text-highlighted hover:border-accented hover:bg-elevated inline-flex h-6 items-stretch overflow-hidden rounded-md border transition-colors max-sm:h-8"
    >
      <span class="flex items-center gap-1.5 px-2 font-medium">
        <UIcon name="i-ph-github-logo" class="size-3.5" :aria-hidden="true" />
        <UIcon name="i-ph-star" class="size-3" :aria-hidden="true" />
        {{ t("empty_layout.footer.github_star") }}
      </span>
      <span
        v-if="githubStars !== null || !githubStarsSettled"
        class="border-default flex items-center border-s px-2 font-mono tabular-nums"
      >
        <USkeleton
          v-if="githubStars === null"
          aria-hidden="true"
          class="h-2.5 w-6"
        />
        <template v-else>{{ formattedGithubStars }}</template>
      </span>
    </a>

    <USelect
      :model-value="locale"
      :items="localesOptions"
      :aria-label="t('empty_layout.footer.language')"
      icon="i-ph-globe"
      trailing-icon="i-ph-caret-up-down"
      color="neutral"
      variant="ghost"
      size="sm"
      class="ms-auto w-auto max-sm:ms-0"
      :ui="{
        base: 'text-muted hover:text-highlighted hover:bg-elevated gap-1.5 bg-transparent text-[12.5px] shadow-none ring-0 md:text-[12.5px]',
        leadingIcon: 'text-muted size-3.5',
        trailingIcon: 'text-dimmed size-3',
        value: 'text-inherit',
      }"
      @update:model-value="onLocaleChange"
    />
  </footer>
</template>
