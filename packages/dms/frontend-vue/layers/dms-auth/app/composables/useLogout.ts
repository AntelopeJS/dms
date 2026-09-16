const SWITCH_ACCOUNT_ROUTE = "/auth/accounts";
const FALLBACK_AUTH_ROUTE = "/auth";

/**
 * Ends the current session and routes to the account switcher when other
 * accounts remain, or to the auth page otherwise. Shared by every logout
 * surface (header user menu, command palette).
 *
 * Clears the session even when the user object is malformed (missing `_id`),
 * so logout never silently no-ops; only the multi-account cleanup needs the id.
 */
export function useLogout() {
  const { user, clear: clearSession } = useUserSession<User>();
  const { accounts, removeAccount } = useMultiAccount();

  async function logout(): Promise<void> {
    const userId = user.value?._id;

    await clearSession();
    if (userId) {
      await removeAccount(userId);
    }

    if (accounts.value.length > 0) {
      await navigateDms(SWITCH_ACCOUNT_ROUTE);
      return;
    }
    await navigateDms(FALLBACK_AUTH_ROUTE);
  }

  return { logout };
}
