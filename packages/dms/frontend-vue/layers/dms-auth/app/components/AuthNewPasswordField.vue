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
</script>

<template>
  <!-- The rules list fills in live; the field itself turns red only with
       the form's error (empty, or a rule still unmet) on blur or submit. -->
  <UFormField :label="props.label" :name="props.name">
    <AuthPasswordInput
      v-model="password"
      autocomplete="new-password"
      :described-by="RULES_ID"
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
