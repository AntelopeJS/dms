<script setup lang="ts">
import { useConfirm } from "../../../composables/confirm/useConfirm";
import DmsCopyButton from "../../copy/CopyButton.vue";

interface InputSecretProps {
  id?: string;
  revealable?: boolean;
  copyable?: boolean;
  /** POSTed after a confirmation; answers `{ value }`, the new secret. */
  rotateUrl?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface RotateResponse {
  value: string;
}

const props = defineProps<InputSecretProps>();
const model = defineModel<string | null | undefined>();
const { t } = useI18n();
const toast = useToast();
const { confirm } = useConfirm();
const { $authFetch } = useAuthFetch();

// v2 .secret: the end of the value stays visible, so a reader can tell two
// secrets apart without revealing either.
const VISIBLE_TAIL = 4;
const MASK_LENGTH = 22;
const MASK = "•";

const isRevealed = ref(false);
const value = computed(() => model.value ?? "");
// An empty secret is typed in plainly: there is nothing to hide yet.
const isMasked = computed(() => !isRevealed.value && value.value !== "");
const masked = computed(() => {
  const tail = value.value.slice(-VISIBLE_TAIL);
  const length = Math.min(
    MASK_LENGTH,
    Math.max(value.value.length - tail.length, VISIBLE_TAIL),
  );
  return `${MASK.repeat(length)}${tail}`;
});

async function rotate(): Promise<void> {
  const url = props.rotateUrl;
  if (!url) return;
  const confirmed = await confirm({
    title: t("dms.form.secret.rotate_title"),
    description: t("dms.form.secret.rotate_description"),
    confirmLabel: t("dms.form.secret.rotate_confirm"),
    color: "warning",
    onConfirm: async () => {
      const response = await $authFetch<RotateResponse>(url, {
        method: "POST",
      });
      model.value = response.value;
    },
  });
  if (confirmed) {
    toast.add({ color: "success", title: t("dms.form.secret.rotated") });
  }
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <UInput
      :id="props.id"
      :model-value="isMasked ? masked : value"
      :readonly="isMasked"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      icon="i-ph-key"
      autocomplete="off"
      spellcheck="false"
      class="min-w-0 flex-1"
      :ui="{ base: 'font-mono text-[12.5px]' }"
      @update:model-value="model = String($event ?? '')"
    >
      <template v-if="props.revealable && value" #trailing>
        <UButton
          :icon="isRevealed ? 'i-ph-eye-slash' : 'i-ph-eye'"
          :label="
            isRevealed ? t('dms.form.secret.hide') : t('dms.form.secret.show')
          "
          :aria-pressed="isRevealed"
          :aria-controls="props.id"
          color="neutral"
          variant="link"
          size="xs"
          @click="isRevealed = !isRevealed"
        />
      </template>
    </UInput>
    <DmsCopyButton v-if="props.copyable && value" :value="value" />
    <UButton
      v-if="props.rotateUrl"
      icon="i-ph-arrows-clockwise"
      :label="t('dms.form.secret.rotate')"
      color="neutral"
      variant="outline"
      :disabled="props.disabled"
      @click="rotate"
    />
  </div>
</template>
