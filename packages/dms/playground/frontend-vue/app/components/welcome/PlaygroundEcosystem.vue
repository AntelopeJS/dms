<script setup lang="ts">
/**
 * Examples › Overview: the AntelopeJS products, each card in the accent of its
 * own site, and the hosting note in the Cloud's. The copy comes from the
 * backend (`.options()`); only the brand colours live here, since no block
 * tone carries them.
 */

/** A product site's accent: the key into ACCENTS. */
type EcosystemAccent = "blue" | "cyan" | "violet";

interface EcosystemProduct {
  title: string;
  tagline: string;
  description: string;
  icon: string;
  accent: EcosystemAccent;
  /** Absolute URL of the product site. */
  to: string;
  /** Host shown at the bottom of the card. */
  linkLabel: string;
  /** Short mono note next to the link ("You are here", "Coming soon"). */
  note?: string;
}

interface EcosystemAction {
  label: string;
  to: string;
  icon?: string;
}

interface EcosystemHosting {
  title: string;
  description: string;
  icon: string;
  accent: EcosystemAccent;
  /** The last one is the main action, drawn in the accent. */
  actions: EcosystemAction[];
}

interface Props {
  title: string;
  description?: string;
  products: EcosystemProduct[];
  hosting?: EcosystemHosting;
}

/**
 * Each site's `--ui-primary` (its 400 step) for dark surfaces, and a darker
 * step of the same ramp for text on light ones, which keeps 4.5:1 on white.
 */
interface AccentColors {
  dark: string;
  light: string;
}

const ACCENTS: Record<EcosystemAccent, AccentColors> = {
  blue: { dark: "#4d8dff", light: "#0042ad" },
  cyan: { dark: "#4dd9e6", light: "#167f8a" },
  violet: { dark: "#a78bfa", light: "#6d28d9" },
};

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  hosting: undefined,
});

function accentStyle(accent: EcosystemAccent): Record<string, string> {
  const colors = ACCENTS[accent];
  return { "--eco-dark": colors.dark, "--eco-light": colors.light };
}

const LINK_ATTRIBUTES = { target: "_blank", rel: "noopener noreferrer" };
</script>

<template>
  <section>
    <DmsSectionHeader
      class="mb-3"
      :title="props.title"
      :description="props.description"
      as="h2"
    />

    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <a
        v-for="product in props.products"
        :key="product.title"
        :href="product.to"
        v-bind="LINK_ATTRIBUTES"
        class="eco-accent eco-card dms-card dms-card--interactive group relative flex flex-col gap-3 overflow-hidden p-[18px] text-start"
        :style="accentStyle(product.accent)"
      >
        <div class="flex items-center gap-3">
          <span class="eco-well grid size-9 shrink-0 place-items-center">
            <UIcon
              :name="product.icon"
              class="size-[19px]"
              aria-hidden="true"
            />
          </span>
          <h3 class="text-highlighted min-w-0 truncate text-sm font-[650]">
            {{ product.title }}
          </h3>
          <UIcon
            name="i-ph-arrow-up-right"
            class="eco-text ms-auto size-4 shrink-0 opacity-0 transition group-hover:opacity-100"
            aria-hidden="true"
          />
        </div>
        <p class="eco-text text-[13px] leading-snug font-semibold">
          {{ product.tagline }}
        </p>
        <p class="text-muted text-[13px] leading-normal">
          {{ product.description }}
        </p>
        <div
          class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-[11.5px] font-medium"
        >
          <span class="eco-text">{{ product.linkLabel }}</span>
          <span v-if="product.note" class="eco-note">{{ product.note }}</span>
        </div>
      </a>
    </div>

    <div
      v-if="props.hosting"
      class="eco-accent eco-hosting mt-6 flex items-center gap-3.5 rounded-(--dms-radius-card) border px-4 py-3.5 max-sm:flex-wrap"
      :style="accentStyle(props.hosting.accent)"
    >
      <span class="eco-well grid size-10 shrink-0 place-items-center">
        <UIcon
          :name="props.hosting.icon"
          class="size-[19px]"
          aria-hidden="true"
        />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-highlighted text-sm font-[650]">
          {{ props.hosting.title }}
        </p>
        <p class="text-muted mt-0.5 text-[13px] leading-relaxed">
          {{ props.hosting.description }}
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2 max-sm:basis-full">
        <UButton
          v-for="(action, index) in props.hosting.actions"
          :key="action.to"
          :to="action.to"
          v-bind="LINK_ATTRIBUTES"
          :label="action.label"
          :icon="action.icon"
          size="sm"
          :color="
            index === props.hosting.actions.length - 1 ? undefined : 'neutral'
          "
          :variant="
            index === props.hosting.actions.length - 1 ? 'solid' : 'outline'
          "
          :class="{
            'eco-button': index === props.hosting.actions.length - 1,
          }"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* --eco-strong is the accent for text and solid fills: the dark ramp step on
   dark surfaces, the light one on light surfaces. */
.eco-accent {
  --eco-strong: var(--eco-light);
}
.dark .eco-accent {
  --eco-strong: var(--eco-dark);
}

.eco-text {
  color: var(--eco-strong);
}

.eco-well {
  border-radius: 10px;
  color: var(--eco-strong);
  background: color-mix(in srgb, var(--eco-dark) 14%, transparent);
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--eco-dark) 34%, transparent);
}

.eco-note {
  color: var(--ui-text-muted);
}

.eco-card {
  border-top: 2px solid var(--eco-dark);
  background-image: radial-gradient(
    120% 70% at 100% 0%,
    color-mix(in srgb, var(--eco-dark) 10%, transparent),
    transparent 65%
  );
}
.eco-card:hover {
  border-color: color-mix(in srgb, var(--eco-dark) 55%, transparent);
  border-top-color: var(--eco-dark);
}

.eco-hosting {
  border-color: color-mix(in srgb, var(--eco-dark) 40%, transparent);
  background-color: var(--ui-bg);
  background-image: linear-gradient(
    100deg,
    color-mix(in srgb, var(--eco-dark) 10%, transparent),
    transparent 70%
  );
}

.eco-button {
  background: var(--eco-strong);
  color: #fff;
}
.eco-button:hover {
  background: color-mix(in srgb, var(--eco-strong) 88%, #000);
}
.dark .eco-button {
  color: #0b1114;
}
.dark .eco-button:hover {
  background: color-mix(in srgb, var(--eco-strong) 88%, #fff);
}
</style>
