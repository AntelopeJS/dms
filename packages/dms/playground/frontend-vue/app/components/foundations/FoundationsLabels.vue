<script setup lang="ts">
import ShowcaseDemo from "./ShowcaseDemo.vue";
import ShowcaseSection from "./ShowcaseSection.vue";

/**
 * Design system › Foundations › Icons, pills & labels: the small identity
 * pieces every v2 screen is built from (layers/dms-ui/app/components).
 */

const TONES = [
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
] as const;
const WELL_TONES = [...TONES, "muted"] as const;
const WELL_SIZES = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl"] as const;
const WELL_ICONS: Record<(typeof WELL_TONES)[number], string> = {
  neutral: "i-ph-tray",
  primary: "i-ph-rocket-launch",
  secondary: "i-ph-sparkle",
  success: "i-ph-check-circle",
  warning: "i-ph-warning",
  error: "i-ph-warning-octagon",
  info: "i-ph-info",
  muted: "i-ph-gear-six",
};
const PILL_LABELS: Record<(typeof TONES)[number], string> = {
  neutral: "Draft",
  primary: "Active",
  secondary: "AI",
  success: "Paid",
  warning: "Pending",
  error: "Failed",
  info: "Synced",
};
const PILL_VARIANTS = ["soft", "outline", "text"] as const;
const EYEBROW_TONES = ["dimmed", "muted", "primary", "error"] as const;

const API_KEY = "ak_live_7f3c9e21b04d";
const COPY_LABEL = `DmsCopyButton value='${API_KEY}'`;
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="icon-well"
      title="DmsIconWell"
      description="Tinted rounded tile with an inset line of its tone: modal headers, nav cards, empty states, settings rows, stat cards."
      :columns="1"
    >
      <ShowcaseDemo label="tone × size ('2xs' 28px → '2xl' 44px)" wide>
        <div class="overflow-x-auto">
          <table class="border-separate" style="border-spacing: 16px 8px">
            <thead>
              <tr>
                <th />
                <th
                  v-for="size in WELL_SIZES"
                  :key="size"
                  class="text-dimmed text-left font-mono text-[11px] font-medium"
                >
                  {{ size }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tone in WELL_TONES" :key="tone">
                <td class="text-muted pe-2 font-mono text-[11.5px]">
                  {{ tone }}
                </td>
                <td v-for="size in WELL_SIZES" :key="size">
                  <DmsIconWell
                    :icon="WELL_ICONS[tone]"
                    :tone="tone"
                    :size="size"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="default slot (initials, glyph) · label='…' (accessible)"
      >
        <div class="flex flex-wrap items-center gap-3">
          <DmsIconWell tone="primary" label="Claire Lambert">
            <span class="text-[12px] font-semibold">CL</span>
          </DmsIconWell>
          <DmsIconWell tone="secondary" size="xl">
            <span class="font-mono text-[13px] font-semibold">AI</span>
          </DmsIconWell>
          <DmsIconWell tone="neutral" size="2xl" label="Loading">
            <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
          </DmsIconWell>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="status-pill"
      title="DmsStatusPill"
      description="Mono status label on a tint of its tone: table cells, module tiles, overview card state lines."
    >
      <ShowcaseDemo label="tone='…' (variant='soft', dot='static')" wide>
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill
            v-for="tone in TONES"
            :key="tone"
            :tone="tone"
            :label="PILL_LABELS[tone]"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="dot='none' · 'static' · 'live'">
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill tone="success" dot="none" label="No dot" />
          <DmsStatusPill tone="success" dot="static" label="Static" />
          <DmsStatusPill tone="success" dot="live" label="Live" />
          <DmsStatusPill tone="error" dot="live" label="Down" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='sm' (20px) · size='md' (22px)">
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill tone="primary" size="sm" label="Small" />
          <DmsStatusPill tone="primary" size="md" label="Medium" />
          <DmsStatusPill
            tone="warning"
            size="sm"
            uppercase
            label="Beta"
            dot="none"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="variant='soft' · 'outline' · 'text'" wide>
        <div class="grid gap-2.5">
          <div
            v-for="variant in PILL_VARIANTS"
            :key="variant"
            class="flex flex-wrap items-center gap-2"
          >
            <span class="text-muted w-16 font-mono text-[11.5px]">
              {{ variant }}
            </span>
            <DmsStatusPill
              v-for="tone in TONES"
              :key="tone"
              :tone="tone"
              :variant="variant"
              :label="PILL_LABELS[tone]"
            />
          </div>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="icon='…' (replaces the dot)">
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill
            tone="success"
            icon="i-ph-check-bold"
            label="Verified"
          />
          <DmsStatusPill tone="warning" icon="i-ph-clock" label="Expires" />
          <DmsStatusPill
            tone="info"
            icon="i-ph-arrows-clockwise"
            variant="outline"
            label="Syncing"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label=":mono='false' · uppercase">
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill tone="primary" :mono="false" label="Sans label" />
          <DmsStatusPill tone="neutral" uppercase label="Installed" />
          <DmsStatusPill
            tone="success"
            variant="text"
            uppercase
            label="Enabled"
          />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="eyebrow"
      title="DmsEyebrow"
      description="The v2 signature label: mono, uppercase and tracked."
    >
      <ShowcaseDemo label="tone='dimmed' · 'muted' · 'primary' · 'error'">
        <div class="grid gap-2">
          <DmsEyebrow
            v-for="tone in EYEBROW_TONES"
            :key="tone"
            :tone="tone"
            :label="`Eyebrow · ${tone}`"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='sm' (10.5px) · size='xs' (9.5px) · truncate">
        <div class="grid gap-2">
          <DmsEyebrow size="sm" label="Workspace settings" />
          <DmsEyebrow size="xs" label="Last sync · 12 s ago" />
          <div class="w-44">
            <DmsEyebrow
              truncate
              label="A very long eyebrow cut with an ellipsis"
            />
          </div>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="section-header"
      title="DmsSectionHeader"
      description="Title (with count, badge and description) above a card, or as the eyebrow head inside one; trailing actions wrap under it on narrow screens."
    >
      <ShowcaseDemo label="size='section' · count · description · #trailing">
        <DmsSectionHeader
          title="Installed modules"
          :count="12"
          description="Modules enabled for the acme workspace."
        >
          <template #trailing>
            <UButton
              label="Browse"
              icon="i-ph-squares-four"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </template>
        </DmsSectionHeader>
      </ShowcaseDemo>
      <ShowcaseDemo label="#badge · danger">
        <div class="grid gap-6">
          <DmsSectionHeader
            title="Two-factor authentication"
            description="A code from your app at every sign-in."
          >
            <template #badge>
              <DmsStatusPill tone="success" size="sm" label="On" />
            </template>
          </DmsSectionHeader>
          <DmsSectionHeader
            title="Danger zone"
            description="These actions cannot be undone."
            danger
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='card' (inside a card) · count · #trailing">
        <div class="dms-card p-[18px]">
          <DmsSectionHeader
            size="card"
            title="Recent invoices"
            :count="48"
            description="Synced every 15 minutes"
          >
            <template #trailing>
              <UButton
                label="View all"
                trailing-icon="i-ph-arrow-right"
                color="neutral"
                variant="ghost"
                size="xs"
              />
            </template>
          </DmsSectionHeader>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="copy-link"
      title="DmsCopyButton · DmsAutoLink"
      description="Copy-to-clipboard icon button (turns green once copied), and a link that picks its behaviour from its target: DMS route, in-page anchor or external URL."
    >
      <ShowcaseDemo :label="COPY_LABEL">
        <div
          class="border-default flex items-center gap-2 justify-self-start rounded-md border bg-(--dms-bg-muted) py-1 ps-3 pe-1"
        >
          <code class="text-toned font-mono text-[12.5px]">{{ API_KEY }}</code>
          <DmsCopyButton :value="API_KEY" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="DmsAutoLink to='/route' · '#anchor' · 'https://…'">
        <div class="grid gap-1.5 text-[13px]">
          <DmsAutoLink
            to="/foundations/foundations-lists"
            class="text-primary hover:underline"
          >
            Internal route → Lists &amp; data (Inertia visit)
          </DmsAutoLink>
          <DmsAutoLink to="#icon-well" class="text-primary hover:underline">
            Anchor → #icon-well (scrolls, no reload)
          </DmsAutoLink>
          <DmsAutoLink
            to="https://antelopejs.com"
            class="text-primary hover:underline"
          >
            External → antelopejs.com (new tab)
          </DmsAutoLink>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
