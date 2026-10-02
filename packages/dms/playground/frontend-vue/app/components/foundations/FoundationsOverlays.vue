<script setup lang="ts">
import { h, ref, resolveComponent } from "vue";
import ShowcaseDemo from "./ShowcaseDemo.vue";
import ShowcaseSection from "./ShowcaseSection.vue";

/**
 * Design system › Foundations › Overlays: DmsConfirmModal, opened through
 * the public useConfirm() composable. Each button shows one option set; the
 * resolved value is logged under the buttons.
 */

const { confirm } = useConfirm();
const USelect = resolveComponent("USelect");
const UCheckbox = resolveComponent("UCheckbox");

const lastResult = ref<string>();
const failNext = ref(true);

async function run(name: string, open: () => Promise<boolean>) {
  const confirmed = await open();
  lastResult.value = `${name} → ${confirmed ? "confirmed (true)" : "cancelled (false)"}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const openSimple = () =>
  run("Simple", () =>
    confirm({
      title: "Publish the storefront?",
      description: "Customers will see the new catalog right away.",
      confirmLabel: "Publish",
    }),
  );

const openMinimal = () =>
  run("Minimal", () =>
    confirm({
      title: "Leave without saving?",
      description: "Your changes to this order will be lost.",
      confirmLabel: "Leave",
      confirmColor: "warning",
      icon: false,
    }),
  );

const openImpact = () =>
  run("Impact list", () =>
    confirm({
      title: "Delete Northwind Traders?",
      description: "The customer and everything attached to it is removed.",
      confirmLabel: "Delete customer",
      confirmColor: "error",
      confirmIcon: "i-ph-trash",
      impact: [
        { icon: "i-ph-shopping-cart", label: "Orders", count: 48 },
        { icon: "i-ph-invoice", label: "Invoices", count: 12 },
        { icon: "i-ph-address-book", label: "Contacts", count: 5 },
      ],
    }),
  );

const openTyped = () =>
  run("Typed confirm", () =>
    confirm({
      title: "Delete the acme workspace?",
      description:
        "Every module, member and record of the workspace is deleted. This cannot be undone.",
      confirmLabel: "Delete workspace",
      confirmColor: "error",
      confirmText: "acme",
    }),
  );

const openAsync = () =>
  run("Async onConfirm", () =>
    confirm({
      title: "Archive 3 orders?",
      description:
        "The first try fails on purpose to show the inline error; confirm again to succeed.",
      confirmLabel: "Archive",
      confirmColor: "warning",
      async onConfirm() {
        await wait(1200);
        if (failNext.value) {
          failNext.value = false;
          throw new Error("The orders service did not answer (504).");
        }
        failNext.value = true;
      },
    }),
  );

const transferTo = ref("bruno");
const notifyOwner = ref(true);
const openBody = () =>
  run("Custom body", () =>
    confirm({
      title: "Remove Claire from the workspace?",
      description: "Her records are transferred to another member first.",
      confirmLabel: "Remove member",
      confirmColor: "error",
      icon: "i-ph-user-minus",
      body: () =>
        h("div", { class: "grid gap-3" }, [
          h(USelect, {
            modelValue: transferTo.value,
            "onUpdate:modelValue": (value: string) =>
              (transferTo.value = value),
            items: [
              { label: "Transfer to Bruno Martin", value: "bruno" },
              { label: "Transfer to Inès Dubois", value: "ines" },
            ],
            class: "w-full",
          }),
          h(UCheckbox, {
            modelValue: notifyOwner.value,
            "onUpdate:modelValue": (value: boolean) =>
              (notifyOwner.value = value),
            label: "Email Claire about the removal",
          }),
        ]),
    }),
  );

const openAcknowledge = () =>
  run("Acknowledge only", () =>
    confirm({
      title: "This role cannot be deleted",
      description:
        "Owner is a built-in role. Move its members to another role instead.",
      icon: "i-ph-lock-simple",
      hideConfirm: true,
      cancelLabel: "Got it",
    }),
  );
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="confirm"
      title="DmsConfirmModal · useConfirm()"
      description="const { confirm } = useConfirm(); await confirm(options) resolves true when the user confirmed. The modal reads its look from confirmColor (primary, warning, error) and its options."
      :columns="3"
    >
      <ShowcaseDemo label="title · description · confirmLabel">
        <UButton
          label="Simple"
          icon="i-ph-rocket-launch"
          class="justify-self-start"
          @click="openSimple"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="confirmColor='warning' · :icon='false' (minimal)">
        <UButton
          label="Minimal"
          color="warning"
          variant="soft"
          class="justify-self-start"
          @click="openMinimal"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="confirmColor='error' · confirmIcon · impact[]">
        <UButton
          label="Impact list"
          color="error"
          variant="soft"
          icon="i-ph-trash"
          class="justify-self-start"
          @click="openImpact"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="confirmText='acme' (typed confirmation)">
        <UButton
          label="Typed confirm"
          color="error"
          variant="outline"
          icon="i-ph-keyboard"
          class="justify-self-start"
          @click="openTyped"
        />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="async onConfirm() · loading · error (first try fails)"
      >
        <UButton
          label="Async with error"
          color="neutral"
          variant="outline"
          icon="i-ph-hourglass-medium"
          class="justify-self-start"
          @click="openAsync"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="body: () => h(…) (reactive custom content) · icon">
        <UButton
          label="Custom body"
          color="neutral"
          variant="outline"
          icon="i-ph-user-minus"
          class="justify-self-start"
          @click="openBody"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="hideConfirm · cancelLabel (acknowledge only)">
        <UButton
          label="Acknowledge only"
          color="neutral"
          variant="outline"
          icon="i-ph-lock-simple"
          class="justify-self-start"
          @click="openAcknowledge"
        />
      </ShowcaseDemo>
      <ShowcaseDemo label="Last result" wide>
        <p
          class="border-default text-toned rounded-md border bg-(--dms-bg-muted) px-3 py-2 font-mono text-[12.5px]"
        >
          {{ lastResult ?? "Open a dialog: its resolved value shows here." }}
          <template v-if="lastResult?.startsWith('Custom body')">
            · transfer to {{ transferTo }} · notify {{ notifyOwner }}
          </template>
        </p>
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
