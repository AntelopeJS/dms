<template>
  <div class="mx-auto max-w-md">
    <DmsCard variant="elevated" :padded="false" class="p-6 sm:p-12">
      <h1 class="pb-5 text-2xl font-bold">
        {{ $t("page.forgot.title_success") }}
      </h1>

      <p class="text-muted pb-7 text-sm font-normal">
        {{ $t("page.forgot.description_success") }}
      </p>

      <UButton :label="$t('button.continue')" to="/auth" block />
    </DmsCard>
  </div>
</template>
