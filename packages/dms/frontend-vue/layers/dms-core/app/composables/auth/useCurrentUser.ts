/**
 * Global reactive access to the signed-in user's identity (name, email, ...).
 *
 * `user` is the shared session state from `useUserSession`, so every consumer
 * (header menu, switch-account page, ...) re-renders as soon as it changes.
 * `refresh` re-fetches the session through the frontend server session hook
 * pulls a fresh `/api/auth/me`) and syncs the stored multi-account entry, so a
 * profile edit propagates immediately without re-logging in.
 */
export function useCurrentUser() {
  const { user, fetch: refreshSession } = useUserSession<User>();
  const { syncActiveAccount } = useMultiAccount();

  async function refresh(): Promise<void> {
    await refreshSession();
    syncActiveAccount();
  }

  return {
    user,
    refresh,
  };
}
