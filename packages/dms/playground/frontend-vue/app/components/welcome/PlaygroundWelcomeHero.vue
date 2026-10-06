<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

/**
 * Examples › Overview: the welcome hero of the playground, the one part of the
 * page no backend block draws. What the playground is, what the DMS is, the
 * links out, and the three layers every page goes through.
 */

const DOCS_URL = "https://dms.antelopejs.com/docs/";
const WEBSITE_URL = "https://dms.antelopejs.com/";
const REPOSITORY_URL = "https://github.com/AntelopeJS/dms";
const REPOSITORY_API = "https://api.github.com/repos/AntelopeJS/dms";
// Shared with the auth footer's star button, so both read one cached count.
const STARS_CACHE_KEY = "dms-github-stars";
// GitHub allows 60 anonymous API calls an hour per visitor.
const STARS_CACHE_TTL_MS = 60 * 60 * 1000;

const HIGHLIGHTS = [
  "Code-first",
  "Open source · Apache 2.0",
  "Vue-first",
  "Self-hostable",
];

interface StackLayer {
  icon: string;
  title: string;
  detail: string;
}

const LAYERS: StackLayer[] = [
  {
    icon: "i-ph-code",
    title: "Playground pages",
    detail: "TypeScript classes in playground/src",
  },
  {
    icon: "i-ph-squares-four",
    title: "AntelopeJS DMS",
    detail: "Pages, blocks, auth, tenancy, settings",
  },
  {
    icon: "i-ph-hexagon",
    title: "AntelopeJS Framework",
    detail: "Modules, contracts and providers",
  },
];

interface CachedStars {
  count: number;
  fetchedAt: number;
}

interface RepositoryResponse {
  stargazers_count?: unknown;
}

const stars = ref<number | null>(null);
const formattedStars = computed(() =>
  stars.value === null
    ? ""
    : new Intl.NumberFormat(undefined, { notation: "compact" }).format(
        stars.value,
      ),
);

function readCachedStars(): CachedStars | null {
  try {
    const raw = sessionStorage.getItem(STARS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedStars) : null;
  } catch {
    return null;
  }
}

function writeCachedStars(count: number): void {
  try {
    const cached: CachedStars = { count, fetchedAt: Date.now() };
    sessionStorage.setItem(STARS_CACHE_KEY, JSON.stringify(cached));
  } catch {
    /* storage unavailable: the count is fetched again next time */
  }
}

async function fetchStars(): Promise<number | null> {
  try {
    const response = await fetch(REPOSITORY_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const { stargazers_count: count } =
      (await response.json()) as RepositoryResponse;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

onMounted(async () => {
  const cached = readCachedStars();
  if (cached && Date.now() - cached.fetchedAt < STARS_CACHE_TTL_MS) {
    stars.value = cached.count;
    return;
  }
  const count = await fetchStars();
  if (count === null) return;
  stars.value = count;
  writeCachedStars(count);
});
</script>

<template>
  <section
    class="dms-card relative overflow-hidden px-5 py-7 sm:px-9 sm:py-9"
    aria-labelledby="playground-welcome-title"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full opacity-70 blur-3xl"
      style="background: var(--dms-accent-tint-strong)"
    />

    <div
      class="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div class="grid gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <DmsIconWell icon="i-ph-flask" size="xl" />
          <DmsStatusPill tone="primary" label="Playground" dot="live" />
        </div>

        <div class="grid gap-3">
          <h1
            id="playground-welcome-title"
            class="text-highlighted text-[26px] leading-tight font-semibold tracking-tight text-balance sm:text-[32px]"
          >
            Welcome to the AntelopeJS DMS playground
          </h1>
          <p class="text-default max-w-2xl text-[15px] leading-relaxed">
            A live test bed for the AntelopeJS Dashboard Management System.
            Every page in the sidebar is a real DMS feature, declared by a
            TypeScript page class on the backend and drawn by the DMS frontend,
            this page included.
          </p>
          <p class="text-muted max-w-2xl text-sm leading-relaxed">
            Build your product, not another back office: the DMS gives your app
            tables, forms, charts, roles &amp; permissions, multi-tenant
            workspaces and modules. It is code-first and developer-owned, and
            built on the AntelopeJS Framework.
          </p>
        </div>

        <ul class="flex flex-wrap gap-1.5" aria-label="Highlights">
          <li v-for="highlight in HIGHLIGHTS" :key="highlight">
            <DmsStatusPill
              :label="highlight"
              variant="outline"
              dot="none"
              :mono="false"
              size="sm"
            />
          </li>
        </ul>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :to="DOCS_URL"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-ph-book-open"
            label="Documentation"
          />
          <UButton
            :to="WEBSITE_URL"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-ph-globe"
            label="Website"
            color="neutral"
            variant="outline"
          />
          <UButton
            :to="REPOSITORY_URL"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-ph-github-logo"
            color="neutral"
            variant="outline"
            aria-label="Star AntelopeJS/dms on GitHub"
          >
            GitHub
            <span
              v-if="stars !== null"
              class="border-default text-muted ms-1 inline-flex items-center gap-1 border-s ps-2 font-mono text-xs tabular-nums"
            >
              <UIcon name="i-ph-star" class="size-3" aria-hidden="true" />
              {{ formattedStars }}
            </span>
          </UButton>
        </div>
      </div>

      <ol class="grid gap-2 max-lg:hidden" aria-label="How a page is built">
        <li
          v-for="(layer, index) in LAYERS"
          :key="layer.title"
          class="grid justify-items-center gap-2"
        >
          <div
            class="border-default bg-default flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-3"
            :class="{ 'ring-primary/40 ring-1': index === 1 }"
          >
            <DmsIconWell
              :icon="layer.icon"
              size="sm"
              :tone="index === 1 ? 'primary' : 'neutral'"
            />
            <div class="min-w-0">
              <p class="text-highlighted text-[13px] font-semibold">
                {{ layer.title }}
              </p>
              <p class="text-muted truncate text-xs">{{ layer.detail }}</p>
            </div>
          </div>
          <UIcon
            v-if="index < LAYERS.length - 1"
            name="i-ph-arrow-down"
            class="text-dimmed size-3.5"
            aria-hidden="true"
          />
        </li>
      </ol>
    </div>
  </section>
</template>
