<script setup lang="ts">
import { type OAuthHandoff, sanitizeRedirectPath } from "../../../shared/oauth";

const OAUTH_FAILED_KEY = "error.oauth.failed";

const route = useDmsRoute();
const homepage = useHomepage();
const dmsApp = useDmsApp();

const redirect = computed(
  () => sanitizeRedirectPath(route.query.redirect) || homepage,
);

type HandoffActions = {
  [K in OAuthHandoff["kind"]]: (
    handoff: Extract<OAuthHandoff, { kind: K }>,
  ) => unknown;
};

// `replace` is a navigation option, not part of the location: passed inside the
// route object it was silently dropped, and the handoff left the OAuth callback
// in the history for the back button to land on.
const REPLACE = { replace: true } as const;

const HANDOFF_ACTIONS: HandoffActions = {
  "2fa": (handoff) =>
    navigateDms(
      {
        path: "/auth/2fa",
        query: { token: handoff.token, methods: handoff.methods.join(",") },
      },
      REPLACE,
    ),
  "no-workspace": (handoff) =>
    navigateDms(
      {
        path: "/auth/no-workspace",
        query: { token: handoff.token, provider: handoff.provider },
      },
      REPLACE,
    ),
  none: () => usePostLoginRedirect(redirect.value),
};

function runHandoffAction(handoff: OAuthHandoff): unknown {
  const action = HANDOFF_ACTIONS[handoff.kind] as (
    value: OAuthHandoff,
  ) => unknown;
  return action(handoff);
}

function redirectToLoginWithError(): unknown {
  return navigateDms(
    { path: "/auth", query: { oauth_error: OAUTH_FAILED_KEY } },
    REPLACE,
  );
}

onMounted(async () => {
  try {
    const handoff = await $fetch<OAuthHandoff>("/auth/oauth/handoff", {
      method: "POST",
    });
    await dmsApp.runWithContext(() => runHandoffAction(handoff));
  } catch {
    await dmsApp.runWithContext(() => redirectToLoginWithError());
  }
});
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center">
    <div class="flex flex-col items-center gap-4">
      <UIcon name="i-ph-spinner" class="text-primary size-8 animate-spin" />
      <p class="text-muted text-sm">
        {{ $t("page.auth.oauth.completing") }}
      </p>
    </div>
  </div>
</template>
