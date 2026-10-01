<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import ShowcaseDemo from "./ShowcaseDemo.vue";
import ShowcaseSection from "./ShowcaseSection.vue";

/**
 * Design system › Foundations › Cards & controls: card frames, navigation
 * tiles, the segmented toggle and the settings rows with their save states.
 */

type Plan = "starter" | "pro" | "enterprise";
const PLANS: { value: Plan; label: string; price: string }[] = [
  { value: "starter", label: "Starter", price: "€0 / month" },
  { value: "pro", label: "Pro", price: "€49 / month" },
  { value: "enterprise", label: "Enterprise", price: "Custom" },
];
const plan = ref<Plan>("pro");

const SEGMENTED_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const view = ref("list");
const VIEW_ITEMS = [
  { label: "List", value: "list", icon: "i-ph-list-bullets" },
  { label: "Board", value: "board", icon: "i-ph-kanban" },
  { label: "Calendar", value: "calendar", icon: "i-ph-calendar-blank" },
];
const period = ref("30d");
const PERIOD_ITEMS = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "1Y", value: "1y" },
];
const inbox = ref("all");
const INBOX_ITEMS = [
  { label: "All", value: "all", count: 24 },
  { label: "Unread", value: "unread", count: 3 },
  { label: "Archived", value: "archived", count: 112, disabled: true },
];
const size = ref<string | number>("sm");

// Settings rows: an instant-save switch and a form saved through the bar.
const digest = ref(true);
const digestState = ref<"idle" | "saving" | "saved">("idle");
async function toggleDigest(value: boolean) {
  digest.value = value;
  digestState.value = "saving";
  await new Promise((resolve) => setTimeout(resolve, 900));
  digestState.value = "saved";
  setTimeout(() => (digestState.value = "idle"), 1800);
}

const saved = reactive({ name: "Acme", locale: "en-GB" });
const workspaceName = ref(saved.name);
const workspaceLocale = ref(saved.locale);
const saving = ref(false);
const changes = computed(() => [
  ...(workspaceName.value !== saved.name ? ["Workspace name"] : []),
  ...(workspaceLocale.value !== saved.locale ? ["Language"] : []),
]);
function discard() {
  workspaceName.value = saved.name;
  workspaceLocale.value = saved.locale;
}
async function save() {
  saving.value = true;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  saved.name = workspaceName.value;
  saved.locale = workspaceLocale.value;
  saving.value = false;
}
const LOCALES = [
  { label: "English (UK)", value: "en-GB" },
  { label: "Français", value: "fr-FR" },
];
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="card"
      title="DmsCard"
      description="The card frame around primary components: plain, with an eyebrow head (title, count, actions) and a muted footer, interactive, selected, elevated."
      :columns="3"
    >
      <ShowcaseDemo label="default (padded)">
        <DmsCard>
          <p class="text-muted text-[13px]">
            A plain card: the body is padded, no head or footer.
          </p>
        </DmsCard>
      </ShowcaseDemo>
      <ShowcaseDemo label="title · count · #actions · #footer">
        <DmsCard title="Recent invoices" :count="12">
          <template #actions>
            <UButton
              icon="i-ph-arrows-clockwise"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Refresh"
            />
            <UButton
              label="View all"
              color="neutral"
              variant="ghost"
              size="xs"
            />
          </template>
          <p class="text-muted text-[13px]">The body under the 48px head.</p>
          <template #footer>
            <span class="text-muted text-[12.5px]">Synced 2 min ago</span>
          </template>
        </DmsCard>
      </ShowcaseDemo>
      <ShowcaseDemo label="variant='elevated' · :padded='false'">
        <DmsCard variant="elevated" :padded="false">
          <div class="text-muted p-3 text-[13px]">
            Elevated: stronger shadow for full-page surfaces (auth box, error
            panel). Unpadded body.
          </div>
        </DmsCard>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="interactive · selected (card picker, click one)"
        wide
      >
        <div class="grid gap-3 md:grid-cols-3">
          <DmsCard
            v-for="item in PLANS"
            :key="item.value"
            as="button"
            type="button"
            interactive
            :selected="plan === item.value"
            class="text-start"
            @click="plan = item.value"
          >
            <span class="text-highlighted block text-sm font-semibold">
              {{ item.label }}
            </span>
            <span class="text-muted font-mono text-xs">{{ item.price }}</span>
          </DmsCard>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="nav-card"
      title="DmsNavCard"
      description="Navigation tile: icon well, title, description, optionally closed by the target's live state or a mono readout; the arrow slides in on hover."
      :columns="3"
    >
      <ShowcaseDemo label="to · icon · title · description">
        <DmsNavCard
          to="/foundations/foundations-labels"
          icon="i-ph-user-circle"
          title="Profile"
          description="Your name, photo, language and theme."
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="state · stateTone='warning' · iconTone">
        <DmsNavCard
          to="#nav-card"
          icon="i-ph-bell"
          icon-tone="warning"
          title="Notifications"
          description="What reaches you, and where."
          state="3 unread"
          state-tone="warning"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="state · stateTone='success'">
        <DmsNavCard
          to="#nav-card"
          icon="i-ph-shield-check"
          icon-tone="success"
          title="Security"
          description="Password, two-factor and sessions."
          state="2FA on · 3 sessions"
          state-tone="success"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="badge='SAAS' · readout (module tile)">
        <DmsNavCard
          to="#nav-card"
          icon="i-ph-invoice"
          title="Billing"
          badge="SaaS"
          description="Plans, invoices and payment methods."
          :readout="['v2.4.1 · up to date', '12 invoices this month']"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="iconTone='muted' · stateTone='error'">
        <DmsNavCard
          to="#nav-card"
          icon="i-ph-plugs"
          icon-tone="muted"
          title="Integrations"
          description="Webhooks, API keys and connected apps."
          state="1 webhook failing"
          state-tone="error"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="to='https://…' (external, new tab)">
        <DmsNavCard
          to="https://antelopejs.com"
          icon="i-ph-book-open"
          icon-tone="info"
          title="Documentation"
          description="Guides and API reference on antelopejs.com."
        />
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="segmented"
      title="DmsSegmented"
      description="Single-select toggle: a recessed track with the active segment raised. Arrow keys, Home and End move between segments, skipping disabled ones."
    >
      <ShowcaseDemo label="variant='default' · icon">
        <DmsSegmented
          v-model="view"
          :items="VIEW_ITEMS"
          aria-label="View"
          class="justify-self-start"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="variant='mono' (period selectors)">
        <DmsSegmented
          v-model="period"
          :items="PERIOD_ITEMS"
          variant="mono"
          aria-label="Period"
          class="justify-self-start"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="count · item disabled">
        <DmsSegmented
          v-model="inbox"
          :items="INBOX_ITEMS"
          aria-label="Inbox filter"
          class="justify-self-start"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="disabled (whole control) · block (full width)">
        <div class="grid gap-3">
          <DmsSegmented
            v-model="period"
            :items="PERIOD_ITEMS"
            variant="mono"
            disabled
            aria-label="Period (disabled)"
            class="justify-self-start"
          />
          <DmsSegmented
            v-model="view"
            :items="VIEW_ITEMS"
            block
            aria-label="View (block)"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="size='xs' (24px) · 'sm' · 'md' · 'lg' · 'xl' (40px)"
        wide
      >
        <div class="flex flex-wrap items-center gap-4">
          <DmsSegmented
            v-for="segmentSize in SEGMENTED_SIZES"
            :key="segmentSize"
            v-model="size"
            :size="segmentSize"
            :items="SEGMENTED_SIZES.map((s) => ({ label: s, value: s }))"
            :aria-label="`Size ${segmentSize}`"
          />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="settings-rows"
      title="DmsFieldRow · DmsSaveStatus · DmsSaveBar"
      description="Settings rows inside a card (inline, form and stack layouts), the instant-save feedback of a row, and the sticky bar that shows while a form is dirty."
      :columns="1"
    >
      <ShowcaseDemo
        label="DmsFieldRow layout='inline' · #label-extra → DmsSaveStatus (toggle the switch)"
      >
        <div class="dms-card overflow-hidden">
          <DmsFieldRow
            label="Weekly digest"
            description="A summary of activity every Monday at 08:00."
          >
            <template #label-extra>
              <DmsSaveStatus :state="digestState" />
            </template>
            <USwitch
              :model-value="digest"
              aria-label="Weekly digest"
              @update:model-value="toggleDigest"
            />
          </DmsFieldRow>
          <DmsFieldRow
            label="Export format"
            description="Used by every table export."
          >
            <USelect
              :model-value="'csv'"
              :items="['csv', 'xlsx', 'json']"
              class="w-32"
            />
          </DmsFieldRow>
          <DmsFieldRow
            label="Single sign-on"
            description="Available on the Enterprise plan."
            disabled
          >
            <UButton
              label="Configure"
              color="neutral"
              variant="outline"
              size="sm"
              disabled
            />
          </DmsFieldRow>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="DmsFieldRow layout='form' · required · layout='stack' — DmsSaveBar dirty · changes · saving (edit a field)"
      >
        <div class="dms-card overflow-clip">
          <DmsFieldRow
            layout="form"
            label="Workspace name"
            description="Shown in the sidebar and in emails."
            required
          >
            <UInput v-model="workspaceName" />
          </DmsFieldRow>
          <DmsFieldRow
            layout="form"
            label="Language"
            description="Default language for new members."
          >
            <USelect v-model="workspaceLocale" :items="LOCALES" />
          </DmsFieldRow>
          <DmsFieldRow
            layout="stack"
            label="Welcome message"
            description="Stack layout: the label sits above the control."
          >
            <UTextarea
              :rows="2"
              placeholder="Welcome to Acme! Start with the Orders module."
            />
          </DmsFieldRow>
          <div class="px-4 pb-4">
            <DmsSaveBar
              :dirty="changes.length > 0"
              :changes="changes"
              :saving="saving"
              @discard="discard"
              @save="save"
            />
            <p v-if="changes.length === 0" class="text-dimmed text-xs">
              Edit the name or the language to show the save bar.
            </p>
          </div>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="DmsSaveStatus state='idle' · 'saving' · 'saved'">
        <div class="flex flex-wrap items-center gap-6">
          <span class="text-muted flex items-center gap-2 text-xs">
            idle <DmsSaveStatus state="idle" />
          </span>
          <span class="text-muted flex items-center gap-2 text-xs">
            saving <DmsSaveStatus state="saving" />
          </span>
          <span class="text-muted flex items-center gap-2 text-xs">
            saved <DmsSaveStatus state="saved" />
          </span>
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
