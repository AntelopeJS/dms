<script setup lang="ts">
import type {
  InputProps,
  InputEmits,
  InputSlots,
} from "@nuxt/ui/components/Input.vue";
import { useForwardPropsEmits } from "reka-ui";
import { FORM_VALIDATOR_KEY } from "../../../composables/form/types/validation";

const props = defineProps<
  InputProps & {
    confirmPassword?: boolean;
    confirmPlaceholder?: string;
  }
>();
const emits = defineEmits<InputEmits>();
defineSlots<InputSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const { processI18n } = useTranslation();

const passwordVisibility = ref(false);
const confirmValue = ref("");

const confirmPropsFiltered = computed(() => {
  const {
    id: _id,
    modelValue: _modelValue,
    confirmPassword: _confirmPassword,
    confirmPlaceholder: _confirmPlaceholder,
    ...rest
  } = props;
  return rest;
});

const confirmInputId = computed(() =>
  props.id ? `${props.id}-confirm` : undefined,
);

const hasMismatch = computed(() => {
  if (!props.confirmPassword) return false;
  const password = String(props.modelValue ?? "");
  if (!password) return false;
  return password !== confirmValue.value;
});

const registerValidator = inject(FORM_VALIDATOR_KEY, null);

if (registerValidator) {
  const unregister = registerValidator(() => !hasMismatch.value);
  onUnmounted(unregister);
}
</script>

<template>
  <div class="grid gap-2">
    <UInput v-bind="forwarded" :type="passwordVisibility ? 'text' : 'password'">
      <template #trailing>
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          :icon="passwordVisibility ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :aria-label="
            passwordVisibility
              ? $t('dms.form.input.hide_password')
              : $t('dms.form.input.show_password')
          "
          :aria-pressed="passwordVisibility"
          :aria-controls="props.id"
          @click="passwordVisibility = !passwordVisibility"
        />
      </template>
    </UInput>
    <template v-if="props.confirmPassword">
      <UInput
        :id="confirmInputId"
        v-bind="confirmPropsFiltered"
        v-model="confirmValue"
        :placeholder="
          props.confirmPlaceholder
            ? processI18n(props.confirmPlaceholder)
            : undefined
        "
        :type="passwordVisibility ? 'text' : 'password'"
        :color="hasMismatch ? 'error' : undefined"
      >
        <template #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            :icon="passwordVisibility ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :aria-label="
              passwordVisibility
                ? $t('dms.form.input.hide_password')
                : $t('dms.form.input.show_password')
            "
            :aria-pressed="passwordVisibility"
            :aria-controls="confirmInputId"
            @click="passwordVisibility = !passwordVisibility"
          />
        </template>
      </UInput>
      <p v-if="hasMismatch" class="text-error text-sm">
        {{ $t("dms.form.validation.password_mismatch") }}
      </p>
    </template>
  </div>
</template>
