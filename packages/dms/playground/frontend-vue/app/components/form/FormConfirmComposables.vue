<script setup lang="ts">
import { h, ref, resolveComponent } from "vue";
import {
  ConfirmActionError,
  ConfirmTextError,
  type ConfirmValues,
} from "#dms-ui/app/composables/confirm/types";
import { useConfirmFrom } from "#dms-ui/app/composables/confirm/useConfirmFrom";
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";

/**
 * Form › Confirmations: the options of `useConfirm()` a Vue component alone
 * can give (a secondary action that runs code, the focused button, a check
 * of the body, the outcomes of `onConfirm`), and `useConfirmFrom()`, which
 * opens a dialog the server words.
 */

const DIALOG_URL = "/api/form-confirm/dialog/{id}";
const SECONDARY_DELAY_MS = 800;
const CONFIRM_DELAY_MS = 600;

const { confirm } = useConfirm();
const { confirmFrom } = useConfirmFrom();
const UCheckbox = resolveComponent("UCheckbox");

const lastResult = ref<string>();
const downloads = ref(0);
const understood = ref(false);
const refuseTypedText = ref(true);

async function run(name: string, open: () => Promise<boolean>) {
  const confirmed = await open();
  lastResult.value = `${name} → ${confirmed ? "confirmed (true)" : "cancelled (false)"}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const openSecondary = () =>
  run("secondaryAction", () =>
    confirm({
      title: "Remove French?",
      description: "Download its translations first: the dialog stays open.",
      color: "error",
      confirmLabel: "Remove",
      secondaryAction: {
        label: "Download fr.json",
        icon: "i-ph-download-simple",
        run: async () => {
          await wait(SECONDARY_DELAY_MS);
          downloads.value += 1;
        },
      },
    }),
  );

const openCaseInsensitive = () =>
  run("confirmTextCaseInsensitive", () =>
    confirm({
      title: "Delete the acme workspace?",
      description: "Type ACME: acme or Acme are accepted too.",
      color: "error",
      confirmLabel: "Delete",
      confirmText: "ACME",
      confirmTextCaseInsensitive: true,
    }),
  );

const openInitialFocus = () =>
  run("initialFocus", () =>
    confirm({
      title: "Discard the draft?",
      description: "Cancel holds the focus: Enter keeps the draft.",
      color: "warning",
      confirmLabel: "Discard",
      initialFocus: "cancel",
    }),
  );

const openFields = () =>
  run("fields", () =>
    confirm({
      title: "Invite a member",
      confirmLabel: "Invite",
      fields: [
        {
          id: "email",
          label: "Email",
          type: "email",
          required: true,
          component: { componentName: "dms-input-email", options: {} },
        },
      ],
      async onConfirm(values: ConfirmValues) {
        await wait(CONFIRM_DELAY_MS);
        lastResult.value = `fields → ${JSON.stringify(values)}`;
      },
    }),
  );

const openValidate = () => {
  understood.value = false;
  return run("validate", () =>
    confirm({
      title: "Rotate the API key?",
      description: "Apps using the old key stop working at once.",
      color: "warning",
      confirmLabel: "Rotate",
      body: () =>
        h(UCheckbox, {
          modelValue: understood.value,
          "onUpdate:modelValue": (value: boolean) => (understood.value = value),
          label: "I have updated my apps",
        }),
      validate: () => understood.value,
    }),
  );
};

const openTextError = () =>
  run("ConfirmTextError", () =>
    confirm({
      title: "Drop the orders table?",
      description: "The first try is refused by the server, under the field.",
      color: "error",
      confirmLabel: "Drop",
      confirmText: "orders",
      async onConfirm() {
        await wait(CONFIRM_DELAY_MS);
        if (!refuseTypedText.value) return;
        refuseTypedText.value = false;
        throw new ConfirmTextError("The table was renamed: reload the page.");
      },
    }),
  );

const openActionError = () =>
  run("ConfirmActionError", () =>
    confirm({
      title: "Publish the storefront?",
      confirmLabel: "Publish",
      async onConfirm() {
        await wait(CONFIRM_DELAY_MS);
        throw new ConfirmActionError({
          title: "The catalog is locked",
          description: "Ada is importing products. Try again in a minute.",
        });
      },
    }),
  );

const openPartial = () =>
  run("partial", () =>
    confirm({
      title: "Archive 5 orders?",
      color: "warning",
      confirmLabel: "Archive",
      async onConfirm() {
        await wait(CONFIRM_DELAY_MS);
        return {
          partial: {
            title: "3 of 5 orders archived",
            description: "2 orders are still being shipped.",
          },
        };
      },
    }),
  );

const openFrom = () =>
  run("useConfirmFrom", () =>
    confirmFrom(DIALOG_URL, {
      params: { id: "acme", name: "Acme" },
      fallback: { color: "error", icon: "i-ph-trash", confirmLabel: "Remove" },
    }),
  );
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="use-confirm"
      title="useConfirm() · options only the browser gives"
      description="The header buttons declare their dialog on the backend; these open one from a Vue component, with a handler of their own."
      :columns="3"
    >
      <ShowcaseDemo label="secondaryAction: { label, icon, run }">
        <UButton
          label="Secondary action"
          icon="i-ph-download-simple"
          color="error"
          variant="soft"
          class="justify-self-start"
          @click="openSecondary"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="confirmText · confirmTextCaseInsensitive">
        <UButton
          label="Type in any case"
          icon="i-ph-keyboard"
          color="error"
          variant="outline"
          class="justify-self-start"
          @click="openCaseInsensitive"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="initialFocus: 'cancel'">
        <UButton
          label="Focus on cancel"
          icon="i-ph-cursor-click"
          color="neutral"
          variant="outline"
          class="justify-self-start"
          @click="openInitialFocus"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="fields · onConfirm(values)">
        <UButton
          label="Fields"
          icon="i-ph-textbox"
          color="neutral"
          variant="outline"
          class="justify-self-start"
          @click="openFields"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="body · validate()">
        <UButton
          label="Validate the body"
          icon="i-ph-check-square"
          color="neutral"
          variant="outline"
          class="justify-self-start"
          @click="openValidate"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="throw new ConfirmTextError(…)">
        <UButton
          label="Typed text refused"
          icon="i-ph-warning"
          color="neutral"
          variant="outline"
          class="justify-self-start"
          @click="openTextError"
        />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="throw new ConfirmActionError({ title, description })"
      >
        <UButton
          label="Action refused"
          icon="i-ph-x-circle"
          color="neutral"
          variant="outline"
          class="justify-self-start"
          @click="openActionError"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="onConfirm → { partial: { title, description } }">
        <UButton
          label="Partial outcome"
          icon="i-ph-circle-half"
          color="warning"
          variant="soft"
          class="justify-self-start"
          @click="openPartial"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="Last result" wide>
        <p
          class="border-default text-toned rounded-md border bg-(--dms-bg-muted) px-3 py-2 font-mono text-[12.5px]"
        >
          {{ lastResult ?? "Open a dialog: its resolved value shows here." }}
          · secondary runs: {{ downloads }}
        </p>
      </ShowcaseDemo>
    </ShowcaseSection>
    <ShowcaseSection
      id="use-confirm-from"
      title="useConfirmFrom() · a dialog the server words"
      description="confirmFrom(url, { params, fallback }) reads a serializeConfirmDialog answer, fills {id} in the URL and {name} in its texts, then opens it."
      :columns="1"
    >
      <ShowcaseDemo
        label="confirmFrom('/api/form-confirm/dialog/{id}', { params: { id: 'acme', name: 'Acme' }, fallback })"
      >
        <UButton
          label="Confirm from the server"
          icon="i-ph-cloud-arrow-down"
          color="error"
          variant="soft"
          class="justify-self-start"
          @click="openFrom"
        />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
