<script setup lang="ts">
import type {
  InputProps,
  InputEmits,
  InputSlots,
} from "@nuxt/ui/components/Input.vue";
import { useForwardPropsEmits } from "reka-ui";
import { FORM_VALIDATOR_KEY } from "../../../composables/form/types/validation";
import DmsPasswordInput from "../../../build/components/form/PasswordInput.vue";

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
    <DmsPasswordInput v-bind="forwarded" v-model:visible="passwordVisibility" />
    <template v-if="props.confirmPassword">
      <DmsPasswordInput
        :id="confirmInputId"
        v-bind="confirmPropsFiltered"
        v-model="confirmValue"
        v-model:visible="passwordVisibility"
        :placeholder="
          props.confirmPlaceholder
            ? processI18n(props.confirmPlaceholder)
            : undefined
        "
        :invalid="hasMismatch"
      />
      <p v-if="hasMismatch" class="text-error text-sm">
        {{ $t("dms.form.validation.password_mismatch") }}
      </p>
    </template>
  </div>
</template>
