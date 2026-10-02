<script setup lang="ts">
import AuthPasswordInput from "./AuthPasswordInput.vue";
import PasswordRules from "../../../dms-ui/app/components/check-list/PasswordRules.vue";

interface AuthNewPasswordFieldProps {
  label: string;
  name?: string;
  disabled?: boolean;
}

const RULES_ID = "new-password-rules";

const props = withDefaults(defineProps<AuthNewPasswordFieldProps>(), {
  name: "password",
  disabled: false,
});

const password = defineModel<string | undefined>();
/** Every rule is met: lets the form keep its submit disabled until then. */
const isValid = defineModel<boolean>("valid", { default: false });

const { strength, score } = usePasswordStrength(
  computed(() => password.value || ""),
);

const isPristine = computed(() => !password.value);

watchEffect(() => {
  isValid.value = score.value === strength.value.length;
});
</script>

<template>
  <UFormField :label="props.label" :name="props.name">
    <AuthPasswordInput
      v-model="password"
      autocomplete="new-password"
      :described-by="RULES_ID"
      :invalid="!isPristine && !isValid"
      :disabled="props.disabled"
      is-new-password
    />

    <PasswordRules
      :list-id="RULES_ID"
      :password="password || ''"
      class="mt-2"
    />
  </UFormField>
</template>
