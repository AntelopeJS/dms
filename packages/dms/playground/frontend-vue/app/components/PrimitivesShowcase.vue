<script setup lang="ts">
import { ref } from "vue";

/**
 * Review page for the Nuxt UI primitives themed to the DMS v2 design
 * (layers/dms-layout/app/theme/*.ts). Every block mirrors a section of the
 * static mockup (components/*.html) so both can be compared side by side.
 */

const ONBOARDING_STEPS = ["Platform", "Administrator", "Ready"];

const onboardingItems = (current: number) =>
  ONBOARDING_STEPS.map((title, index) => ({
    title,
    icon: index < current ? "i-ph-check-bold" : undefined,
  }));

const setupItems = [
  {
    title: "Scan with your app",
    description: "1Password, Google Authenticator, Authy or any TOTP app.",
    icon: "i-ph-check-bold",
  },
  {
    title: "Enter the 6-digit code",
    description: "It refreshes every 30 seconds.",
  },
  {
    title: "Save your recovery codes",
    description: "Each code signs you in once if you lose your phone.",
  },
];

const page = ref(12);
const outlinePage = ref(1);
const sizePage = ref(2);

const text = ref("");
const notes = ref("");
const quantity = ref(12);
const tags = ref(["urgent", "b2b"]);
const status = ref("paid");
const statusItems = ["paid", "pending", "refunded"];
const company = ref<string>();
const companies = ["Northwind Traders", "Globex Logistics", "Initech SARL"];
const code = ref(["4", "8", "2"]);

const modules = ref(["orders", "invoices"]);
const moduleItems = [
  {
    value: "orders",
    label: "Orders",
    text: "Carts, checkout and fulfilment.",
    well: "i-ph-shopping-cart",
  },
  {
    value: "invoices",
    label: "Invoices",
    text: "PDF invoices and credit notes.",
    well: "i-ph-invoice",
  },
  {
    value: "translations",
    label: "Translations",
    text: "Manage locales and missing keys.",
    well: "i-ph-translate",
  },
  {
    value: "mailing",
    label: "Mailing",
    text: "Campaigns and newsletters.",
    well: "i-ph-envelope-simple",
    disabled: true,
  },
];

const plan = ref("pro");
const planItems = [
  {
    value: "starter",
    label: "Starter",
    text: "One storefront, 3 seats.",
    price: "€0 / month",
    well: "i-ph-storefront",
  },
  {
    value: "pro",
    label: "Pro",
    text: "Unlimited storefronts, 20 seats.",
    price: "€49 / month",
    well: "i-ph-rocket-launch",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    text: "SSO, audit log, dedicated support.",
    price: "Custom",
    well: "i-ph-buildings",
  },
];

const shipping = ref("express");
const shippingItems = [
  { value: "standard", label: "Standard", description: "3–5 business days" },
  { value: "express", label: "Express", description: "Next business day" },
  {
    value: "courier",
    label: "Same-day courier",
    description: "Not available in Lyon",
    disabled: true,
  },
];

const switchOn = ref(true);
const switchOff = ref(false);

const portalItems = [
  { label: "Home", icon: "i-ph-house", active: true },
  {
    label: "Sales",
    icon: "i-ph-shopping-cart",
    children: [
      {
        label: "Orders",
        description: "Track, fulfil and refund customer orders.",
        icon: "i-ph-receipt",
      },
      {
        label: "Invoices",
        description: "Issued, due and overdue invoices.",
        icon: "i-ph-invoice",
      },
      {
        label: "Discounts",
        description: "Coupons and automatic promotions.",
        icon: "i-ph-percent",
      },
    ],
  },
  { label: "Customers", icon: "i-ph-users" },
  {
    label: "Catalog",
    icon: "i-ph-package",
    badge: { label: "New", color: "neutral" as const },
  },
];

const recordItems = [
  { label: "Overview", active: true },
  { label: "Orders", badge: "48" },
  { label: "Invoices", badge: "12" },
  { label: "Contacts" },
  { label: "Activity" },
];

const treeItems = [
  {
    label: "Brussels DC",
    icon: "i-ph-buildings",
    defaultExpanded: true,
    children: [
      {
        label: "Hall A",
        icon: "i-ph-folder",
        defaultExpanded: true,
        children: [
          { label: "Aisle 04 · Rack 12", icon: "i-ph-package" },
          { label: "Aisle 05 · Rack 03", icon: "i-ph-package" },
        ],
      },
      { label: "Hall B", icon: "i-ph-folder", children: [{ label: "Dock" }] },
    ],
  },
  { label: "Antwerp port", icon: "i-ph-buildings", children: [{ label: "Q" }] },
];
const treeSelected = ref();

const tableData = [
  {
    id: "#10482",
    customer: "Northwind Traders",
    status: "Pending",
    total: 12480.5,
  },
  { id: "#10481", customer: "Globex Logistics", status: "Paid", total: 4120 },
  { id: "#10480", customer: "Initech SARL", status: "Shipped", total: 890 },
];
const rowSelection = ref<Record<string, boolean>>({ "1": true });
</script>

<template>
  <div class="grid gap-10 pb-10">
    <!-- Stepper -->
    <section class="grid gap-4">
      <h2 class="text-highlighted text-[15px] font-[650]">Stepper</h2>
      <div class="grid gap-6 md:grid-cols-2">
        <div class="grid content-start gap-4">
          <span
            class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >
            Horizontal · sm (onboarding)
          </span>
          <UStepper
            v-for="current in [0, 1, 2]"
            :key="current"
            :items="onboardingItems(current)"
            :model-value="current"
            size="sm"
            disabled
          />
          <span
            class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >
            DmsStepIndicator (onboarding page)
          </span>
          <DmsStepIndicator
            :labels="ONBOARDING_STEPS"
            :current="1"
            steps-label="Setup progress"
          />
          <span
            class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >
            Horizontal · md · lg
          </span>
          <UStepper :items="onboardingItems(1)" :model-value="1" />
          <UStepper :items="onboardingItems(1)" :model-value="1" size="lg" />
          <span
            class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >
            Dot style · xs
          </span>
          <UStepper :items="onboardingItems(1)" :model-value="1" size="xs" />
        </div>
        <div class="grid content-start gap-4">
          <span
            class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >
            Vertical · md (security setup)
          </span>
          <UStepper
            :items="setupItems"
            :model-value="1"
            orientation="vertical"
          />
          <span
            class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >
            Vertical · dot style
          </span>
          <UStepper
            :items="setupItems"
            :model-value="1"
            orientation="vertical"
            size="xs"
          />
        </div>
      </div>
    </section>

    <!-- Pagination -->
    <section class="grid gap-4">
      <h2 class="text-highlighted text-[15px] font-[650]">Pagination</h2>
      <div
        class="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-x-4 gap-y-5"
      >
        <span
          class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >Solid</span
        >
        <UPagination
          v-model:page="page"
          :total="1300"
          :items-per-page="25"
          :sibling-count="1"
          show-edges
        />
        <span
          class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >Outline</span
        >
        <UPagination
          v-model:page="outlinePage"
          :total="50"
          :items-per-page="10"
          :show-controls="true"
          active-variant="outline"
          :ui="{ first: 'hidden', last: 'hidden' }"
        />
        <span
          class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >Sizes</span
        >
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <UPagination
            v-for="size in ['xs', 'sm', 'md', 'lg'] as const"
            :key="size"
            v-model:page="sizePage"
            :total="30"
            :items-per-page="10"
            :size="size"
            :sibling-count="0"
            :ui="{ first: 'hidden', last: 'hidden' }"
          />
        </div>
      </div>
    </section>

    <!-- Input variants -->
    <section class="grid gap-4">
      <h2 class="text-highlighted text-[15px] font-[650]">
        Field variants · outline · soft · ghost
      </h2>
      <div class="grid grid-cols-[110px_repeat(3,minmax(0,1fr))] gap-3">
        <span />
        <span
          v-for="variant in ['outline', 'soft', 'ghost']"
          :key="variant"
          class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          >{{ variant }}</span
        >
        <span class="text-muted self-center text-[12.5px]">UInput</span>
        <UInput
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`input-${variant}`"
          v-model="text"
          :variant="variant"
          icon="i-ph-magnifying-glass"
          placeholder="Search customers…"
        />
        <span class="text-muted self-center text-[12.5px]">UTextarea</span>
        <UTextarea
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`textarea-${variant}`"
          v-model="notes"
          :variant="variant"
          :rows="2"
          placeholder="Internal note…"
        />
        <span class="text-muted self-center text-[12.5px]">UInputNumber</span>
        <UInputNumber
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`number-${variant}`"
          v-model="quantity"
          :variant="variant"
          orientation="vertical"
        />
        <span class="text-muted self-center text-[12.5px]">UInputTags</span>
        <UInputTags
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`tags-${variant}`"
          v-model="tags"
          :variant="variant"
          placeholder="Add a tag…"
        />
        <span class="text-muted self-center text-[12.5px]">USelect</span>
        <USelect
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`select-${variant}`"
          v-model="status"
          :items="statusItems"
          :variant="variant"
        />
        <span class="text-muted self-center text-[12.5px]">USelectMenu</span>
        <USelectMenu
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`selectmenu-${variant}`"
          v-model="company"
          :items="companies"
          :variant="variant"
          placeholder="Select a company"
        />
        <span class="text-muted self-center text-[12.5px]">UInputMenu</span>
        <UInputMenu
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`inputmenu-${variant}`"
          v-model="company"
          :items="companies"
          :variant="variant"
          placeholder="Type a company…"
        />
        <span class="text-muted self-center text-[12.5px]">UInputDate</span>
        <UInputDate
          v-for="variant in ['outline', 'soft', 'ghost'] as const"
          :key="`date-${variant}`"
          :variant="variant"
        />
      </div>
      <div class="grid gap-3">
        <span
          class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
        >
          UPinInput · sm · md · lg · xl
        </span>
        <div class="flex flex-wrap items-end gap-6">
          <UPinInput
            v-for="size in ['sm', 'md', 'lg', 'xl'] as const"
            :key="size"
            v-model="code"
            :length="6"
            :size="size"
          />
        </div>
        <span
          class="text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
        >
          DmsAuthCodeInput (sign-in code, xl)
        </span>
        <div class="justify-self-start">
          <DmsAuthCodeInput v-model="code" />
        </div>
      </div>
    </section>

    <!-- Choice cards and switch -->
    <section class="grid gap-4">
      <h2 class="text-highlighted text-[15px] font-[650]">
        Checkbox &amp; radio cards · switch states
      </h2>
      <UCheckboxGroup
        v-model="modules"
        :items="moduleItems"
        variant="card"
        orientation="horizontal"
        indicator="end"
        legend="Modules to install"
      >
        <template #label="{ item }">
          <span class="flex items-start gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg ring ring-inset"
              :class="
                modules.includes(item.value)
                  ? 'bg-(--dms-accent-tint-strong) text-primary ring-(--dms-accent-line)'
                  : 'bg-elevated text-muted ring-default'
              "
            >
              <UIcon :name="item.well" class="size-[17px]" />
            </span>
            <span class="grid gap-[3px]">
              <span>{{ item.label }}</span>
              <span class="text-muted text-[12.5px] font-normal">{{
                item.text
              }}</span>
            </span>
          </span>
        </template>
      </UCheckboxGroup>
      <URadioGroup
        v-model="plan"
        :items="planItems"
        variant="card"
        orientation="horizontal"
        indicator="end"
        legend="Plan"
      >
        <template #label="{ item }">
          <span class="flex items-start gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg ring ring-inset"
              :class="
                plan === item.value
                  ? 'bg-(--dms-accent-tint-strong) text-primary ring-(--dms-accent-line)'
                  : 'bg-elevated text-muted ring-default'
              "
            >
              <UIcon :name="item.well" class="size-[17px]" />
            </span>
            <span class="grid gap-[3px]">
              <span>{{ item.label }}</span>
              <span class="text-muted text-[12.5px] font-normal">{{
                item.text
              }}</span>
              <span class="text-toned mt-1.5 font-mono text-xs font-semibold">{{
                item.price
              }}</span>
            </span>
          </span>
        </template>
      </URadioGroup>
      <div class="grid gap-6 md:grid-cols-2">
        <URadioGroup
          v-model="shipping"
          :items="shippingItems"
          variant="card"
          legend="Shipping · vertical cards"
        />
        <div class="grid content-start gap-3.5">
          <USwitch v-model="switchOff" label="Off" />
          <USwitch v-model="switchOn" label="On" />
          <USwitch
            :model-value="true"
            loading
            label="Loading"
            description="Saving… a short recap is added to each order."
          />
          <USwitch :model-value="false" disabled label="Disabled" />
          <UFormField error="Accept the terms to continue.">
            <USwitch :model-value="false" label="Invalid" />
          </UFormField>
        </div>
      </div>
    </section>

    <!-- Horizontal navigation -->
    <section class="grid gap-4">
      <h2 class="text-highlighted text-[15px] font-[650]">
        Horizontal navigation
      </h2>
      <div
        class="flex h-12 items-center rounded-(--dms-radius-card) border border-default bg-(--dms-bg-muted) px-3"
      >
        <span class="text-highlighted me-3.5 text-sm font-[650]">Acme</span>
        <UNavigationMenu :items="portalItems" orientation="horizontal" />
      </div>
      <div class="border-default border-b">
        <UNavigationMenu
          :items="recordItems"
          orientation="horizontal"
          variant="link"
        />
      </div>
    </section>

    <!-- Data display -->
    <section class="grid gap-4">
      <h2 class="text-highlighted text-[15px] font-[650]">
        Tree · chip · separator · link · empty · table
      </h2>
      <div class="grid gap-6 md:grid-cols-2">
        <div
          class="rounded-lg border border-accented bg-(--dms-bg-field) p-1.5"
        >
          <UTree v-model="treeSelected" :items="treeItems" />
        </div>
        <div class="grid content-start gap-5">
          <div class="flex items-center gap-5">
            <UChip>
              <UButton
                icon="i-ph-bell"
                color="neutral"
                variant="ghost"
                aria-label="Notifications"
              />
            </UChip>
            <UChip text="3" size="3xl">
              <UAvatar text="CL" />
            </UChip>
            <UChip color="error" size="lg">
              <UIcon name="i-ph-envelope-simple" class="text-muted size-5" />
            </UChip>
          </div>
          <USeparator label="or" />
          <USeparator />
          <p class="text-muted text-[13px]">
            Already have an account? <ULink to="#">Sign in</ULink>
          </p>
        </div>
      </div>
      <div class="grid gap-6 md:grid-cols-2">
        <UEmpty
          icon="i-ph-tray"
          title="No orders yet"
          description="Orders placed on the storefront show up here."
          :actions="[{ label: 'New order', icon: 'i-ph-plus' }]"
        />
        <UEmpty
          icon="i-ph-magnifying-glass"
          title="No results"
          description="Try another search or clear the filters."
          variant="naked"
        />
      </div>
      <div class="dms-card overflow-hidden">
        <UTable v-model:row-selection="rowSelection" :data="tableData" />
      </div>
    </section>
  </div>
</template>
