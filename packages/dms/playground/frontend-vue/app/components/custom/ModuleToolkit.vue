<script setup lang="ts">
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";

/**
 * Frontend modules › Custom components › Module toolkit: the composables a
 * module's own component calls to read its backend, report a refusal, check
 * a permission, guard a form's unsaved changes and write composed texts.
 */

const API_ROOT = "/api/playground/frontend-modules";
const TOOLKIT_PERMISSION =
  "library.frontend-modules.custom-components.custom-toolkit";
const UNKNOWN_PERMISSION = "playground.not-a-permission";
const SAVE_DELAY_MS = 800;
const DAY_MS = 86_400_000;
const DUE_IN_DAYS = 3;
const INVOICE_CENTS = 2900;
const JSON_INDENT = 2;

const FETCH_CODE = `const { $authFetch } = useAuthFetch();
const me = await $authFetch("${API_ROOT}/whoami");`;
const ERROR_CODE = `const { presentError } = useApiErrorPresenter();
try {
  await $authFetch("${API_ROOT}/refused");
} catch (error) {
  presentError(error, { fallbackKey: "error.500.description" });
}`;
const DIRTY_CODE = `const { dirty, markClean } = useFormDirty(() => ({ ...state }));
const { confirmLeave } = useUnsavedChanges({ dirty });`;
const REQUEST_BODY = JSON.stringify(
  { name: "Acme", plan: "pro", seats: 12, modules: ["orders", "invoices"] },
  null,
  JSON_INDENT,
);
const CURL_SAMPLE = `curl -H "Authorization: Bearer $TOKEN" https://dms.example.com${API_ROOT}/whoami?expand=roles,permissions,preferences,sessions`;

const { $authFetch } = useAuthFetch();
const { presentError } = useApiErrorPresenter();
const { permissions, isLoaded, hasPermission } = usePermissions();
const { processText } = useComposedText();

const whoami = ref("");
const isFetching = ref(false);

async function readWhoami(): Promise<void> {
  isFetching.value = true;
  try {
    const answer = await $authFetch(`${API_ROOT}/whoami`);
    whoami.value = JSON.stringify(answer, null, JSON_INDENT);
  } catch (error) {
    presentError(error, { fallbackKey: "error.500.description" });
  } finally {
    isFetching.value = false;
  }
}

async function callRefused(): Promise<void> {
  try {
    await $authFetch(`${API_ROOT}/refused`);
  } catch (error) {
    presentError(error, { fallbackKey: "error.500.description" });
  }
}

interface BillingContact {
  name: string;
  email: string;
}

const state = reactive<BillingContact>({
  name: "Acme",
  email: "billing@acme.test",
});
const saving = ref(false);
const { dirty, baseline, markClean } = useFormDirty<BillingContact>(() => ({
  ...state,
}));
const { confirmLeave } = useUnsavedChanges({ dirty });

async function save(): Promise<void> {
  saving.value = true;
  await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS));
  markClean();
  saving.value = false;
}

async function discard(): Promise<void> {
  if (!(await confirmLeave())) return;
  Object.assign(state, baseline.value);
}

const invoiceText = computed(() =>
  processText({
    key: "demo.frontend.toolkit.invoice",
    params: {
      amount: { type: "money", value: INVOICE_CENTS, currency: "EUR" },
      due: { type: "relative", value: Date.now() + DUE_IN_DAYS * DAY_MS },
    },
  }),
);
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="auth-fetch"
      title="useAuthFetch · useApiErrorPresenter"
      description="$authFetch sends the session's token and the content language with every request, and renews the token when it expired. useApiErrorPresenter turns a refused call into one translated toast."
    >
      <ShowcaseDemo label="$authFetch(url)" :code="FETCH_CODE">
        <UButton
          label="Who am I?"
          icon="i-ph-user"
          size="sm"
          class="justify-self-start"
          :loading="isFetching"
          @click="readWhoami"
        />
        <DmsCodeSnippet
          v-if="whoami"
          :code="whoami"
          language="json"
          title="Answer"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="presentError(error, options)" :code="ERROR_CODE">
        <UButton
          label="Call a route that refuses"
          icon="i-ph-prohibit"
          color="error"
          variant="outline"
          size="sm"
          class="justify-self-start"
          @click="callRefused"
        />
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="permissions"
      title="usePermissions · DmsPermissionGate"
      description="The viewer's permission ids, loaded once per session. The gate renders its default slot when the viewer holds the permission, its #fallback slot otherwise. An administrator holds the wildcard, so both gates open for them: sign in as a narrower role to see a fallback."
    >
      <ShowcaseDemo label="usePermissions()">
        <DmsKeyValueList
          dense
          :items="[
            { label: 'isLoaded', value: String(isLoaded), type: 'mono' },
            {
              label: 'permissions.size',
              value: permissions.size,
              type: 'mono',
            },
            {
              label: `hasPermission('${UNKNOWN_PERMISSION}')`,
              value: String(hasPermission(UNKNOWN_PERMISSION)),
              type: 'mono',
            },
          ]"
        />
      </ShowcaseDemo>
      <ShowcaseDemo
        :label="`<DmsPermissionGate permission='${TOOLKIT_PERMISSION}'>`"
      >
        <DmsPermissionGate :permission="TOOLKIT_PERMISSION">
          <DmsBanner
            tone="success"
            icon="i-ph-check-circle"
            size="sm"
            title="You may see this page"
          />
          <template #fallback>
            <DmsBanner tone="warning" size="sm" title="Fallback slot" />
          </template>
        </DmsPermissionGate>
        <DmsPermissionGate :permission="UNKNOWN_PERMISSION">
          <DmsBanner
            tone="info"
            icon="i-ph-info"
            size="sm"
            title="Granted: the wildcard holds every permission"
          />
          <template #fallback>
            <DmsBanner
              tone="warning"
              size="sm"
              title="Fallback: nobody holds this permission"
            />
          </template>
        </DmsPermissionGate>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="unsaved-changes"
      title="useFormDirty · useUnsavedChanges · DmsSaveBar · DmsFormRequiredLegend"
      description="A form of the module's own: dirty while its values differ from the saved ones, clean again when they are put back. While dirty, leaving the page (a link, Back, a reload) asks first; so does Discard, through confirmLeave."
      :columns="1"
    >
      <ShowcaseDemo
        label="Edit a field, then open another page"
        :code="DIRTY_CODE"
        wide
      >
        <div class="dms-card grid gap-4 p-4">
          <UFormField label="Company" required>
            <UInput v-model="state.name" class="w-full" />
          </UFormField>
          <UFormField label="Billing email" required>
            <UInput v-model="state.email" type="email" class="w-full" />
          </UFormField>
          <DmsFormRequiredLegend />
          <DmsSaveBar
            :dirty="dirty"
            :saving="saving"
            variant="band"
            @save="save"
            @discard="discard"
          />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="composed-text"
      title="useComposedText"
      description="Writes a composed text (an i18n key and typed parameters: money, dates, relative dates, numbers) in the reader's language and format. Switch the language: the sentence and its amount follow."
    >
      <ShowcaseDemo label="processText({ key, params })">
        <p class="text-highlighted text-[13px]">{{ invoiceText }}</p>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="code-snippet"
      title="DmsCodeSnippet"
      description="Read-only code in the editor's look, with a copy button: the public component for any code a module shows. With a title or a language it has a head; without, the copy button floats in the corner."
    >
      <ShowcaseDemo label="title · language='json' · max-lines">
        <DmsCodeSnippet
          :code="REQUEST_BODY"
          language="json"
          title="Request body"
          :max-lines="6"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="headless · wrap='anywhere'">
        <DmsCodeSnippet :code="CURL_SAMPLE" wrap="anywhere" />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
