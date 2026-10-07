<script setup lang="ts">
import ShowcaseDemo from "./ShowcaseDemo.vue";
import ShowcaseSection from "./ShowcaseSection.vue";

/**
 * Design system › Foundations › Lists & data: the rows, facts and figures
 * cards are filled with.
 */

const KEY_VALUE_ITEMS = [
  { label: "Customer", value: "Northwind Traders", type: "text" },
  {
    label: "Status",
    value: "Paid",
    type: "status",
    tone: "success",
  },
  { label: "Total", value: 12480.5, type: "money" },
  {
    label: "Refunded",
    value: 120,
    type: "money",
    currency: "USD",
    tone: "error",
  },
  { label: "Issued", value: "2026-09-14", type: "date" },
  { label: "Invoice", value: "INV-2026-0482", type: "mono" },
  {
    label: "Contact",
    value: "claire@northwind.example",
    type: "link",
    href: "mailto:claire@northwind.example",
  },
  {
    label: "2FA",
    value: "On",
    type: "text",
    tone: "success",
    detail: "Authenticator app",
  },
  { label: "Notes", value: null },
] as const;

const SHORT_FACTS = [
  { label: "Plan", value: "Pro", type: "status", tone: "primary" },
  { label: "Seats", value: "8 / 10", type: "mono" },
  { label: "Renews", value: "2026-11-01", type: "date" },
  { label: "Monthly", value: 49, type: "money" },
  { label: "Region", value: "eu-west-1", type: "mono" },
  { label: "Owner", value: "Claire Lambert" },
] as const;

const SECURITY_STATS = [
  {
    icon: "i-ph-shield-check",
    eyebrow: "Two-factor",
    value: "On",
    detail: "Authenticator app",
    detailTone: "success",
    href: "#stat-group",
  },
  {
    icon: "i-ph-key",
    eyebrow: "Password",
    value: "Strong",
    detail: "Changed 3 months ago",
  },
  {
    icon: "i-ph-devices",
    eyebrow: "Sessions",
    value: 3,
    detail: "1 new this week",
    detailTone: "warning",
  },
  {
    icon: "i-ph-lifebuoy",
    eyebrow: "Recovery codes",
    value: "8 / 10",
    detail: "2 used",
  },
] as const;

const MODULE_STATS = [
  {
    icon: "i-ph-squares-four",
    eyebrow: "Installed",
    value: 12,
    tone: "primary",
  },
  {
    icon: "i-ph-arrow-circle-up",
    eyebrow: "Updates",
    value: 3,
    tone: "warning",
  },
  { icon: "i-ph-warning", eyebrow: "Errors", value: 1, tone: "error" },
  {
    icon: "i-ph-check-circle",
    eyebrow: "Healthy",
    value: 11,
    tone: "success",
  },
] as const;
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="list-row"
      title="DmsListRow"
      description="One row of a list inside a card: settings rows (md), feed and inbox rows (sm), the current device, links, and a bare lead for nested labels."
    >
      <ShowcaseDemo
        label="size='md' · icon · title · description · meta · #trailing"
      >
        <div class="dms-card overflow-hidden">
          <DmsListRow
            icon="i-ph-envelope-simple"
            title="Email address"
            :meta="['claire@acme.example', 'Verified']"
          >
            <template #trailing>
              <UButton
                label="Change"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </template>
          </DmsListRow>
          <DmsListRow
            icon="i-ph-device-mobile"
            tone="primary"
            title="Authenticator app"
            description="Codes from 1Password, Authy or Google Authenticator."
            :meta="['Added Sep 14', 'Last used today']"
          >
            <template #default>
              Authenticator app
              <DmsStatusPill tone="success" size="sm" label="On" />
            </template>
            <template #trailing>
              <UButton
                icon="i-ph-dots-three"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="More"
              />
            </template>
          </DmsListRow>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="current · mono · trailing='…' · truncate">
        <div class="dms-card overflow-hidden">
          <DmsListRow
            icon="i-ph-desktop"
            title="Chrome on Windows · This device"
            :meta="['Brussels, BE', '81.24.10.4']"
            mono
            current
            trailing="Now"
          />
          <DmsListRow
            icon="i-ph-device-mobile-camera"
            title="Safari on iPhone 15 with a very long device name that gets cut"
            :meta="['Antwerp, BE', '2a02:a03f:6c4e::1']"
            mono
            truncate
            trailing="2 h ago"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="size='sm' · :unread='true|false' · marker='trailing' (feed)"
      >
        <div class="dms-card overflow-hidden">
          <DmsListRow
            size="sm"
            icon="i-ph-user-plus"
            tone="primary"
            icon-size="xs"
            title="Bruno joined the workspace"
            :meta="['Members', '5 min ago']"
            unread
            trailing="10:42"
          />
          <DmsListRow
            size="sm"
            icon="i-ph-invoice"
            icon-size="xs"
            title="Invoice INV-0482 was paid"
            :meta="['Billing', '1 h ago']"
            :unread="false"
            trailing="09:15"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="size='sm' · marker='leading' (inbox) · description · interactive"
      >
        <div class="dms-card overflow-hidden">
          <DmsListRow
            size="sm"
            marker="leading"
            icon="i-ph-warning"
            tone="warning"
            title="Disk usage above 80%"
            description="The storage of the acme workspace is filling up."
            :meta="['System', 'Today 08:02']"
            unread
            interactive
          />
          <DmsListRow
            size="sm"
            marker="leading"
            icon="i-ph-check-circle"
            tone="muted"
            title="Export ready"
            description="orders-2026-09.csv · 1.2 MB"
            :meta="['Exports', 'Yesterday']"
            :unread="false"
            interactive
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="to='…' (whole row is a link) · #leading (avatar)">
        <div class="dms-card overflow-hidden">
          <DmsListRow
            to="/foundations/foundations-surfaces"
            title="Claire Lambert"
            :meta="['Owner', 'claire@acme.example']"
          >
            <template #leading>
              <UAvatar text="CL" size="md" />
            </template>
            <template #trailing>
              <UIcon name="i-ph-caret-right" class="text-dimmed size-4" />
            </template>
          </DmsListRow>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="bare (lead only, e.g. inside a settings row)">
        <div class="dms-card flex items-center justify-between gap-4 p-4">
          <DmsListRow
            bare
            icon="i-ph-bell-ringing"
            title="Desktop notifications"
            :meta="['Mentions and assignments']"
          />
          <USwitch :model-value="true" aria-label="Desktop notifications" />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="activity-item"
      title="DmsActivityItem"
      description="Feed preset of DmsListRow: a tinted well, a one-line title, a dimmed subtitle and a mono time. Stacked in DmsActivityFeed, history panels, recent requests."
    >
      <ShowcaseDemo label="iconColor · title · subtitle · trailing · unread">
        <div class="dms-card overflow-hidden">
          <DmsActivityItem
            icon="i-ph-rocket-launch"
            icon-color="primary"
            title="Billing module installed"
            subtitle="by Claire Lambert"
            trailing="10:42"
            unread
          />
          <DmsActivityItem
            icon="i-ph-check-circle"
            icon-color="success"
            title="Import finished: 1,284 contacts"
            subtitle="contacts.csv"
            trailing="09:15"
          />
          <DmsActivityItem
            icon="i-ph-warning"
            icon-color="warning"
            title="Webhook retried 3 times"
            subtitle="orders.created"
            trailing="08:57"
          />
          <DmsActivityItem
            icon="i-ph-x-circle"
            icon-color="error"
            title="Payment failed"
            subtitle="INV-0479 · card declined"
            trailing="Yesterday"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="mono (paths, queries) · :interactive='false' · #default slot"
      >
        <div class="dms-card overflow-hidden">
          <DmsActivityItem
            icon="i-ph-arrow-right"
            icon-color="info"
            title="GET /api/orders?status=open"
            subtitle="200 · 48 ms"
            trailing="12:01:22"
            mono
            :interactive="false"
          />
          <DmsActivityItem
            icon="i-ph-arrow-right"
            icon-color="error"
            subtitle="500 · 1.2 s"
            trailing="12:01:09"
            mono
            :interactive="false"
          >
            POST /api/invoices
            <DmsStatusPill tone="error" size="sm" label="500" dot="none" />
          </DmsActivityItem>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="key-value-list"
      title="DmsKeyValueList"
      description="Label left, value right, rows split by a hairline: record facts, side panels. Values are typed (text, status, money, date, link, mono)."
    >
      <ShowcaseDemo
        label="type='text|status|money|date|mono|link' · tone · detail · currency · null"
      >
        <div class="dms-card px-[18px] py-1.5">
          <DmsKeyValueList :items="[...KEY_VALUE_ITEMS]" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="dense (32px rows) · loading (values turn to skeletons)"
      >
        <div class="grid gap-4">
          <div class="dms-card px-[18px] py-1.5">
            <DmsKeyValueList :items="[...SHORT_FACTS].slice(0, 4)" dense />
          </div>
          <div class="dms-card px-[18px] py-1.5">
            <DmsKeyValueList
              :items="[...SHORT_FACTS].slice(0, 3)"
              dense
              loading
            />
          </div>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label=":columns='2'">
        <div class="dms-card px-[18px] py-1.5">
          <DmsKeyValueList :items="[...SHORT_FACTS]" :columns="2" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="loading without items (skeletonCount=3)">
        <div class="dms-card px-[18px] py-1.5">
          <DmsKeyValueList loading :skeleton-count="3" />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label=":columns='3'" wide>
        <div class="dms-card px-[18px] py-1.5">
          <DmsKeyValueList :items="[...SHORT_FACTS]" :columns="3" />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="stat-group"
      title="DmsStatGroup"
      description="A row of figures: one card split by hairlines (joined, security status) or one compact card per figure (cards, modules summary)."
      :columns="1"
    >
      <ShowcaseDemo
        label="layout='joined' · icon · eyebrow · value · detail · detailTone · href"
      >
        <DmsStatGroup :items="[...SECURITY_STATS]" label="Security status" />
      </ShowcaseDemo>
      <ShowcaseDemo label="layout='cards' · tone">
        <DmsStatGroup :items="[...MODULE_STATS]" layout="cards" />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="layout='joined' · :columns='2' · loading (with items: labels stay)"
      >
        <DmsStatGroup :items="[...SECURITY_STATS]" :columns="2" loading />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="layout='cards' · loading without items (skeletonCount=4)"
      >
        <DmsStatGroup layout="cards" loading :skeleton-count="4" />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
