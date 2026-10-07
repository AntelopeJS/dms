import { useMultiAccount } from "#dms-core/app/composables/auth/useMultiAccount";

const ESTABLISH_ENDPOINT = "/auth/establish";
const REMOVE_ACCOUNT_ENDPOINT = "/auth/remove-account";

/** The body the frontend server posts to `endpoint` to reopen the session. */
export interface SessionHandoffPayload {
  token: string;
}

/**
 * Sent back by a credential change that rotated the account's auth key: every
 * token issued so far, this device's included, stopped working, and `payload`
 * buys this device a new pair at `endpoint`.
 */
export interface SessionHandoff {
  endpoint: string;
  payload: SessionHandoffPayload;
}

interface BrowserSession {
  accountId?: string;
}

/**
 * Keeps this device signed in across a rotation of the account's auth key:
 * the frontend server opens the session again from the handoff, under a new
 * account entry, and the old entry — holding a dead refresh token — is dropped.
 */
export function useSessionHandoff() {
  const { session, fetch: refreshUser } = useUserSession<
    unknown,
    BrowserSession
  >();
  const { addCurrentAccount } = useMultiAccount();

  return async function adoptSessionHandoff(
    handoff: SessionHandoff | undefined,
  ): Promise<void> {
    if (!handoff) return;
    const previousAccountId = session.value?.accountId;
    await $fetch(ESTABLISH_ENDPOINT, {
      method: "POST",
      body: { endpoint: handoff.endpoint, payload: handoff.payload },
    });
    if (previousAccountId) {
      await $fetch(REMOVE_ACCOUNT_ENDPOINT, {
        method: "POST",
        body: { accountId: previousAccountId },
      });
    }
    await refreshUser();
    addCurrentAccount();
  };
}
