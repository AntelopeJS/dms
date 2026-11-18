<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { normalizeHex } from "./accent";

/**
 * The custom accent's picker: a color area and hue track for the pointer, and
 * a hex field for the keyboard. Each valid color is emitted as it is picked;
 * the area keeps its own position while the color it emits comes back.
 */
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [color: string] }>();

const { t } = useI18n();

const color = ref(normalizeHex(props.modelValue) ?? "#000000");
const typed = ref(color.value);
const problem = computed(() => normalizeHex(typed.value) === undefined);

watch(
  () => props.modelValue,
  (next) => {
    const normalized = normalizeHex(next);
    if (normalized && normalized !== color.value) {
      color.value = normalized;
      typed.value = normalized;
    }
  },
);

function pick(next: string): void {
  const normalized = normalizeHex(next);
  if (!normalized || normalized === color.value) return;
  color.value = normalized;
  typed.value = normalized;
  emit("update:modelValue", normalized);
}

function type(next: string): void {
  typed.value = next;
  const normalized = normalizeHex(next);
  if (normalized && normalized !== color.value) {
    color.value = normalized;
    emit("update:modelValue", normalized);
  }
}

function settle(): void {
  typed.value = color.value;
}
</script>

<template>
  <div class="flex w-56 flex-col gap-3 p-3">
    <UColorPicker
      :model-value="color"
      format="hex"
      class="w-full"
      @update:model-value="pick"
    />
    <div class="flex flex-col gap-1">
      <UInput
        :model-value="typed"
        :aria-label="t('branding.accent.hex')"
        :aria-invalid="problem"
        :color="problem ? 'error' : 'neutral'"
        maxlength="7"
        size="xs"
        class="w-full font-mono"
        data-accent-hex
        @update:model-value="(next: unknown) => type(String(next))"
        @blur="settle"
      />
      <p v-if="problem" role="alert" class="text-error text-xs">
        {{ t("branding.accent.hex_problem") }}
      </p>
    </div>
  </div>
</template>
