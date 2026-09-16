<script setup lang="ts">
import NotificationPreferencesForm from "../../build/components/pages/settings/notification/NotificationPreferencesForm.vue";
import NotificationsList from "../../build/components/pages/settings/notification/NotificationsList.vue";
</script>

<template>
  <div class="space-y-5 pb-16">
    <DmsCard as="section">
      <NotificationPreferencesForm />
    </DmsCard>
    <DmsCard as="section">
      <NotificationsList />
    </DmsCard>
  </div>
</template>
