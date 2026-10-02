<script setup lang="ts">
import {
  type AvatarFieldOptions,
  useProfileAvatar,
} from "../../../../../composables/settings/profile/useProfileAvatar";
import { SECURITY_PAGE_PATH } from "../../../../../composables/settings/security/useSecurityOverview";
import ProfileAvatar from "./ProfileAvatar.vue";

interface AvatarValue {
  key: string;
}

interface AvatarFieldComponent {
  options?: AvatarFieldOptions;
}

interface AvatarField {
  component?: AvatarFieldComponent;
}

interface ProfileResponse {
  name?: string;
  email?: string;
  avatar?: AvatarValue | null;
  isValidated?: boolean;
}

interface ProfilePersonalInfoProps {
  endpoint: string;
  avatarField?: AvatarField;
}

const props = defineProps<ProfilePersonalInfoProps>();

const NAME_INPUT_ID = "profile-name";
const EMAIL_ANCHOR = "#email";

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { user, refresh: refreshSession } = useCurrentUser();
const { upload, resolveUrl } = useProfileAvatar(
  () => props.avatarField?.component?.options ?? {},
);

const saved = ref<ProfileResponse>({
  name: user.value?.name,
  email: user.value?.email,
});
const name = ref(saved.value.name ?? "");
const avatar = ref<AvatarValue | null>(null);
const avatarUrl = ref<string | null>(null);
const isUploading = ref(false);
const isSaving = ref(false);
const fileInput = useTemplateRef<HTMLInputElement>("fileInput");

const savedName = computed(() => saved.value.name ?? "");
const isNameChanged = computed(() => name.value.trim() !== savedName.value);
const isAvatarChanged = computed(
  () => (avatar.value?.key ?? null) !== (saved.value.avatar?.key ?? null),
);
const isDirty = computed(() => isNameChanged.value || isAvatarChanged.value);
const changes = computed(() =>
  [
    isAvatarChanged.value ? "$page.settings.profile.avatar" : "",
    isNameChanged.value ? "$page.settings.profile.name" : "",
  ].filter(Boolean),
);
const canSave = computed(() => !!name.value.trim() && !isUploading.value);

async function applyProfile(profile: ProfileResponse): Promise<void> {
  saved.value = profile;
  name.value = profile.name ?? "";
  avatar.value = profile.avatar ?? null;
  avatarUrl.value = profile.avatar
    ? await resolveUrl(profile.avatar.key)
    : null;
}

function pickFile(): void {
  fileInput.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  isUploading.value = true;
  try {
    const result = await upload(file);
    if (result.rejection) {
      toast.add({
        title: t(`page.settings.profile.avatar_rejected_${result.rejection}`),
        color: "error",
      });
      return;
    }
    avatar.value = { key: result.key! };
    avatarUrl.value = URL.createObjectURL(file);
  } catch {
    toast.add({
      title: t("page.settings.profile.avatar_error"),
      color: "error",
    });
  } finally {
    isUploading.value = false;
  }
}

function removeAvatar(): void {
  avatar.value = null;
  avatarUrl.value = null;
}

async function discard(): Promise<void> {
  await applyProfile(saved.value);
}

async function save(): Promise<void> {
  if (!name.value.trim()) {
    toast.add({
      title: t("page.settings.profile.name_required"),
      color: "error",
    });
    return;
  }
  if (!canSave.value) return;
  isSaving.value = true;
  try {
    const profile = await $authFetch<ProfileResponse>(props.endpoint, {
      method: "POST",
      body: { name: name.value.trim(), avatar: avatar.value },
    });
    await applyProfile(profile);
    toast.add({ title: t("page.settings.profile.saved"), color: "success" });
    await refreshSession();
  } catch {
    toast.add({ title: t("page.settings.profile.save_error"), color: "error" });
  } finally {
    isSaving.value = false;
  }
}

onMounted(async () => {
  await applyProfile(await $authFetch<ProfileResponse>(props.endpoint));
});
</script>

<template>
  <DmsSection
    title="$page.settings.profile.title"
    description="$page.settings.profile.description"
    bare
  >
    <form class="dms-card overflow-hidden" @submit.prevent="save">
      <DmsFieldRow
        layout="form"
        label="$page.settings.profile.avatar"
        description="$page.settings.profile.avatar_description"
      >
        <div class="flex items-center gap-4">
          <ProfileAvatar
            :name="name || savedName"
            :src="avatarUrl"
            :loading="isUploading"
            @edit="pickFile"
          />
          <div class="grid gap-1.5">
            <div class="flex flex-wrap gap-1.5">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-ph-upload-simple"
                :loading="isUploading"
                :label="t('page.settings.profile.avatar_upload')"
                @click="pickFile"
              />
              <UButton
                v-if="avatar"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-ph-trash"
                :label="t('page.settings.profile.avatar_remove')"
                @click="removeAvatar"
              />
            </div>
            <span class="text-muted text-xs">
              {{ t("page.settings.profile.avatar_hint") }}
            </span>
          </div>
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            :accept="
              props.avatarField?.component?.options?.constraints?.allowedMimetypes?.join(
                ',',
              ) || 'image/*'
            "
            @change="onFileChange"
          />
        </div>
      </DmsFieldRow>

      <DmsFieldRow
        layout="form"
        description="$page.settings.profile.name_description"
        required
      >
        <template #label>
          <label :for="NAME_INPUT_ID">
            {{ t("page.settings.profile.name") }}
          </label>
        </template>
        <UInput
          :id="NAME_INPUT_ID"
          v-model="name"
          autocomplete="name"
          class="w-full max-w-[480px]"
        />
        <span v-if="isNameChanged && savedName" class="text-muted text-xs">
          {{ t("page.settings.profile.name_was", { name: savedName }) }}
        </span>
      </DmsFieldRow>

      <DmsFieldRow
        layout="form"
        label="$page.settings.profile.email"
        description="$page.settings.profile.email_description"
      >
        <div class="flex max-w-[680px] flex-wrap items-center gap-2.5">
          <div
            class="text-toned border-default flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-md border bg-(--dms-bg-muted) px-2.5 text-sm"
            role="textbox"
            aria-readonly="true"
            :aria-label="t('page.settings.profile.email_readonly')"
          >
            <UIcon
              name="i-ph-envelope-simple"
              class="text-dimmed size-4 shrink-0"
            />
            <span class="min-w-0 flex-1 truncate">{{ saved.email }}</span>
            <UBadge
              v-if="saved.isValidated !== undefined"
              :color="saved.isValidated ? 'success' : 'warning'"
              variant="subtle"
              size="sm"
              class="shrink-0"
              :icon="saved.isValidated ? 'i-ph-seal-check' : 'i-ph-warning'"
              :label="
                saved.isValidated
                  ? t('page.settings.security.verified')
                  : t('page.settings.security.not_verified')
              "
            />
          </div>
          <DmsLink
            :to="`${SECURITY_PAGE_PATH}${EMAIL_ANCHOR}`"
            class="text-primary inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline hover:underline-offset-3"
          >
            {{ t("page.settings.profile.email_change_link") }}
            <UIcon name="i-ph-arrow-right" class="size-3.5" />
          </DmsLink>
        </div>
        <span class="text-muted inline-flex items-center gap-1.5 text-xs">
          <UIcon name="i-ph-lock-simple" class="text-dimmed size-3.5" />
          {{ t("page.settings.profile.credentials_hint") }}
        </span>
      </DmsFieldRow>
    </form>

    <DmsSaveBar
      :dirty="isDirty"
      :saving="isSaving"
      :changes="changes"
      @discard="discard"
      @save="save"
    />
  </DmsSection>
</template>
