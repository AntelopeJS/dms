<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import EmailLayout from "./components/EmailLayout.vue";
import EmailButton from "./components/EmailButton.vue";
import { emailStyles } from "./components/index";

const props = defineProps<{
  email: string;
  signupLink: string;
  expiresInDays: number;
  workspaceName?: string;
  inviterName?: string;
  platformName?: string;
}>();

const { t, locale } = useI18n();

const joinTarget = computed(() => {
  const { workspaceName, platformName } = props;
  if (workspaceName && platformName) {
    return t("emails.admin_invite.workspace_on_platform", {
      workspace: workspaceName,
      platform: platformName,
    });
  }
  return workspaceName || platformName;
});

const title = computed(() =>
  props.workspaceName
    ? t("emails.admin_invite.title_workspace", {
        workspace: props.workspaceName,
      })
    : t("emails.admin_invite.title"),
);

const invitation = computed(() => {
  if (!joinTarget.value) {
    return t("emails.admin_invite.invitation");
  }
  return props.inviterName
    ? t("emails.admin_invite.invitation_from_inviter", {
        inviter: props.inviterName,
        target: joinTarget.value,
      })
    : t("emails.admin_invite.invitation_to_target", {
        target: joinTarget.value,
      });
});
</script>

<template>
  <EmailLayout :title="title" :lang="locale">
    <EText :style="emailStyles.text">
      {{ t("emails.admin_invite.greeting") }}
    </EText>

    <EText :style="emailStyles.text">
      {{ invitation }} {{ t("emails.admin_invite.call_to_action") }}
    </EText>

    <EmailButton
      :href="signupLink"
      :expires-in="t('emails.admin_invite.expires_in', { days: expiresInDays })"
      :expires-label="t('emails.admin_invite.expires_label')"
    >
      {{ t("emails.admin_invite.button") }}
    </EmailButton>

    <template #footer>
      <EText :style="emailStyles.footer">
        {{ t("emails.admin_invite.footer") }}
      </EText>
    </template>
  </EmailLayout>
</template>
