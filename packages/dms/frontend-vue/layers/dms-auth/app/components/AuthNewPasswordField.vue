<script setup lang="ts">
import DmsPasswordInput from "#dms-ui/app/build/components/form/PasswordInput.vue";
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
    <DmsPasswordInput
      v-model="password"
      size="lg"
      autocomplete="new-password"
      :aria-describedby="RULES_ID"
      :disabled="props.disabled"
      labelled-toggle
      has-lock-icon
    />

    <PasswordRules
      :list-id="RULES_ID"
      :password="password || ''"
      class="mt-2"
    />
  </UFormField>
</template>
