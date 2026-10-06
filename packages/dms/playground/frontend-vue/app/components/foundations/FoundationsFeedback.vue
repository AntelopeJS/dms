<script setup lang="ts">
import { ref } from "vue";
import ShowcaseDemo from "./ShowcaseDemo.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import DmsPermissionVeil from "#dms-ui/app/build/components/permission/PermissionVeil.vue";

/**
 * Design system › Foundations › Feedback & status: notices, empty states,
 * meters, rule lists and permission veils.
 */

const BANNER_TONES = [
  { tone: "warning", icon: "i-ph-warning", title: "Beta module" },
  { tone: "info", icon: "i-ph-info", title: "Maintenance tonight" },
  { tone: "primary", icon: "i-ph-sparkle", title: "New: saved views" },
  { tone: "success", icon: "i-ph-check-circle", title: "Import finished" },
  { tone: "error", icon: "i-ph-warning-octagon", title: "Sync failed" },
] as const;
const dismissed = ref(false);

/** A prop as written in a template, for the demo labels. */
const attr = (name: string, value: string) => `${name}='${value}'`;

const EMPTY_VARIANTS = [
  {
    variant: "no-data",
    title: "No orders yet",
    description: "Orders placed on the storefront show up here.",
  },
  {
    variant: "no-result",
    title: "No results",
    description: "Try another search or clear the filters.",
  },
  {
    variant: "no-access",
    title: "Restricted",
    description: "Ask an administrator for the Billing role.",
  },
  {
    variant: "error",
    title: "Could not load invoices",
    description: "The billing service did not answer. Try again.",
  },
] as const;

const SEATS_SEGMENTS = [
  { value: 6, tone: "accent", label: "6 members" },
  { value: 2, tone: "soft", label: "2 pending" },
  { value: 2, tone: "neutral", label: "2 free" },
] as const;
const STORAGE_SEGMENTS = [
  { value: 38, tone: "info", label: "Files 38 GB" },
  { value: 21, tone: "secondary", label: "Images 21 GB" },
  { value: 9, tone: "warning", label: "Backups 9 GB" },
] as const;

const CHECK_ITEMS = [
  { label: "Database reachable", state: "ok" },
  { label: "Mail relay slow (2.4 s)", state: "warn" },
  { label: "Webhook endpoint unreachable", state: "error" },
  { label: "Search index rebuilding", state: "pending" },
  { label: "Next backup at 02:00", state: "info" },
] as const;
const RULE_ITEMS = [
  { label: "At least 12 characters", state: "ok" },
  { label: "One uppercase letter", state: "error" },
  { label: "One number", state: "ok" },
  { label: "One symbol", state: "error" },
] as const;

const meterPassword = ref("");
const summaryPassword = ref("Antelope2026");

const STATUS_HISTORY = [
  ...Array.from({ length: 18 }, () => "ok" as const),
  "warn" as const,
  ...Array.from({ length: 6 }, () => "ok" as const),
  "down" as const,
  ...Array.from({ length: 4 }, () => "ok" as const),
];
const STATUS_METRICS = [
  { label: "Latency p95", value: 182, unit: "ms", sub: "−12 ms vs last week" },
  { label: "Error rate", value: "0.4", unit: "%", tone: "warning" as const },
  { label: "Requests", value: "1.2M", sub: "last 24 h" },
];
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="banner"
      title="DmsBanner"
      description="Notice banner: a tinted wash over the card surface with a boxed icon, for module beta notices, maintenance and results."
    >
      <ShowcaseDemo
        label="tone='warning' · 'info' · 'primary' · 'success' · 'error'"
        wide
      >
        <div class="grid gap-3">
          <DmsBanner
            v-for="item in BANNER_TONES"
            :key="item.tone"
            :tone="item.tone"
            :icon="item.icon"
            :title="item.title"
            :description="`${attr('tone', item.tone)} · ${attr('size', 'md')} (default)`"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='sm' (title and description inline)">
        <div class="grid gap-3">
          <DmsBanner
            size="sm"
            tone="info"
            icon="i-ph-info"
            title="Read-only."
            description="You are viewing an archived record."
          />
          <DmsBanner
            size="sm"
            tone="warning"
            title="Trial ends in 3 days."
            description="Add a payment method to keep your data."
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="#actions · dismissible (@dismiss)">
        <DmsBanner
          v-if="!dismissed"
          tone="primary"
          icon="i-ph-sparkle"
          title="Saved views are here"
          description="Pin a filter set and share it with your team."
          dismissible
          @dismiss="dismissed = true"
        >
          <template #actions>
            <UButton label="Try it" size="sm" />
          </template>
        </DmsBanner>
        <UButton
          v-else
          label="Show the dismissed banner again"
          icon="i-ph-arrow-counter-clockwise"
          color="neutral"
          variant="outline"
          size="sm"
          class="justify-self-start"
          @click="dismissed = false"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="#cli (inset command box with DmsCopyButton)" wide>
        <DmsBanner
          tone="warning"
          title="This module is in beta"
          description="Install the CLI to follow the release notes."
        >
          <template #cli>
            <div
              class="border-default mt-2.5 flex items-center gap-2 justify-self-start rounded-md border bg-(--dms-bg-muted) py-1 ps-3 pe-1"
            >
              <code class="text-toned font-mono text-[12px]">
                npx ajs module add @acme/billing
              </code>
              <DmsCopyButton value="npx ajs module add @acme/billing" />
            </div>
          </template>
        </DmsBanner>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="empty-state"
      title="DmsEmptyState"
      description="Why a list or card is empty, with the actions that fit: four variants, framed (hatched) or bare, three sizes."
    >
      <ShowcaseDemo
        v-for="item in EMPTY_VARIANTS"
        :key="item.variant"
        :label="`${attr('variant', item.variant)} · hatched`"
      >
        <div class="dms-card overflow-hidden">
          <DmsEmptyState
            :variant="item.variant"
            :title="item.title"
            :description="item.description"
            hatched
            :actions="
              item.variant === 'no-data'
                ? [{ label: 'New order', icon: 'i-ph-plus' }]
                : item.variant === 'no-result'
                  ? [
                      {
                        label: 'Clear filters',
                        color: 'neutral',
                        variant: 'outline',
                      },
                    ]
                  : item.variant === 'error'
                    ? [
                        {
                          label: 'Retry',
                          icon: 'i-ph-arrow-clockwise',
                          color: 'neutral',
                          variant: 'outline',
                        },
                      ]
                    : undefined
            "
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='sm' · bare (no frame)">
        <div class="dms-card">
          <DmsEmptyState
            size="sm"
            title="No data for this period"
            description="Pick a wider range."
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='lg' · icon · tone · #actions slot">
        <div class="dms-card">
          <DmsEmptyState
            size="lg"
            icon="i-ph-users-three"
            tone="accent"
            title="Invite your team"
            description="Members get their own sign-in and the roles you pick."
          >
            <template #actions>
              <UButton label="Invite members" icon="i-ph-user-plus" />
              <UButton label="Learn more" color="neutral" variant="ghost" />
            </template>
          </DmsEmptyState>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="meter"
      title="DmsMeter"
      description="Label, mono value and a bar: a single value, stacked segments with a legend, warning / error thresholds."
    >
      <ShowcaseDemo label="label · hint · value · max · format='fraction'">
        <DmsMeter
          label="Seats"
          hint="8 in use · 2 free"
          :value="8"
          :max="10"
          format="fraction"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="segments · legend · #legend-end">
        <DmsMeter
          label="Seats"
          :segments="[...SEATS_SEGMENTS]"
          :max="10"
          legend
          format="fraction"
          value-label="8 / 10"
        >
          <template #legend-end>
            <ULink to="#meter" class="text-primary text-xs">Manage</ULink>
          </template>
        </DmsMeter>
      </ShowcaseDemo>
      <ShowcaseDemo label="warnAt=75 · errorAt=90 (value 62 · 81 · 96)">
        <div class="grid gap-4">
          <DmsMeter
            v-for="value in [62, 81, 96]"
            :key="value"
            label="API calls"
            :value="value"
            :warn-at="75"
            :error-at="90"
            format="percent"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="format='fraction' · 'percent' · 'value' · 'none'">
        <div class="grid gap-4">
          <DmsMeter label="fraction" :value="34" :max="50" format="fraction" />
          <DmsMeter label="percent" :value="34" :max="50" format="percent" />
          <DmsMeter label="value" :value="34" :max="50" format="value" />
          <DmsMeter label="none" :value="34" :max="50" format="none" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="size='xs' (4px) · 'sm' (6px) · 'md' (8px) · tone">
        <div class="grid gap-4">
          <DmsMeter :value="72" size="xs" tone="success" />
          <DmsMeter :value="72" size="sm" tone="accent" />
          <DmsMeter :value="72" size="md" tone="secondary" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="segments (storage) · legend">
        <DmsMeter
          label="Storage"
          hint="68 of 100 GB"
          :segments="[...STORAGE_SEGMENTS]"
          :max="100"
          legend
          format="percent"
          size="md"
        />
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="check-list"
      title="DmsCheckList · DmsPasswordRules"
      description="A list of checks, each with its state: health readouts, sign-up rules. DmsPasswordRules evaluates the password rules live."
    >
      <ShowcaseDemo
        label="states: ok · warn · error · pending · info (marker='icon')"
      >
        <DmsCheckList :items="[...CHECK_ITEMS]" />
      </ShowcaseDemo>
      <ShowcaseDemo label="marker='plain' · size='sm' · framed">
        <DmsCheckList
          :items="[...CHECK_ITEMS]"
          marker="plain"
          size="sm"
          framed
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="marker='glyph' · size='xs' (mono readout)">
        <DmsCheckList :items="[...CHECK_ITEMS]" marker="glyph" size="xs" />
      </ShowcaseDemo>
      <ShowcaseDemo
        label=":columns='2' · framed · pristine (errors read as pending)"
      >
        <div class="grid gap-3">
          <DmsCheckList :items="[...RULE_ITEMS]" :columns="2" framed />
          <DmsCheckList :items="[...RULE_ITEMS]" :columns="2" framed pristine />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label=":tint-labels='false' · truncate">
        <div class="w-44">
          <DmsCheckList
            :items="[...CHECK_ITEMS]"
            :tint-labels="false"
            truncate
            size="sm"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="DmsPasswordRules variant='meter' (type below)">
        <div class="grid gap-3">
          <UInput
            v-model="meterPassword"
            type="password"
            placeholder="Choose a password"
            aria-describedby="demo-password-rules"
            icon="i-ph-lock-simple"
          />
          <DmsPasswordRules
            :password="meterPassword"
            variant="meter"
            list-id="demo-password-rules"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="DmsPasswordRules variant='summary' (settings)">
        <div class="grid gap-3">
          <UInput
            v-model="summaryPassword"
            type="text"
            placeholder="New password"
            icon="i-ph-lock-simple"
          />
          <DmsPasswordRules :password="summaryPassword" variant="summary" />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="permission-veil"
      title="DmsPermissionVeil"
      description="Shows what a role would lose on a block without taking it away: hidden (hatched veil + lock), readonly or limited (badge with a tooltip)."
      :columns="3"
    >
      <ShowcaseDemo
        v-for="state in ['hidden', 'readonly', 'limited'] as const"
        :key="state"
        :label="`${attr('state', state)} · label · detail (hover the badge)`"
      >
        <div class="pt-3">
          <DmsPermissionVeil
            :state="state"
            :label="
              state === 'hidden'
                ? 'Hidden for Support'
                : state === 'readonly'
                  ? 'Read only'
                  : 'Limited'
            "
            :detail="
              state === 'hidden'
                ? 'Support cannot see invoices.'
                : state === 'readonly'
                  ? 'Edit, delete and export are withheld.'
                  : 'Amounts above €10,000 are masked.'
            "
          >
            <DmsCard title="Invoices" :count="12">
              <DmsKeyValueList
                dense
                :items="[
                  { label: 'Due', value: 12480.5, type: 'money' },
                  {
                    label: 'Status',
                    value: 'Overdue',
                    type: 'status',
                    tone: 'error',
                  },
                  { label: 'Customer', value: 'Northwind Traders' },
                ]"
              />
            </DmsCard>
          </DmsPermissionVeil>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="status-summary"
      title="DmsStatusSummary"
      description="Health hero of a module overview: a status ring and value, key metrics, and a per-day history strip."
      :columns="1"
    >
      <ShowcaseDemo
        label="status='ok' · live · metrics · since · history · historyLabels"
      >
        <DmsStatusSummary
          status-value="Operational"
          status="ok"
          status-label="API"
          icon="i-ph-pulse"
          since="Up 14 d 6 h · checked 12 s ago"
          :metrics="STATUS_METRICS"
          :history="STATUS_HISTORY"
          :history-labels="['30 days ago', '99.2% uptime', 'Today']"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="status='warn' · :live='false'">
        <DmsStatusSummary
          status-value="Degraded"
          status="warn"
          status-label="Mail relay"
          icon="i-ph-envelope-simple"
          since="Slow since 09:42"
          :live="false"
          :metrics="[
            { label: 'Queue', value: 318, sub: 'messages' },
            {
              label: 'Delay',
              value: '2.4',
              unit: 's',
              tone: 'warning',
            },
          ]"
        />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
