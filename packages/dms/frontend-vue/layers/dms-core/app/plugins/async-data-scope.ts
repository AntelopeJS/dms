import { watch } from "vue";
import {
  defineDmsPlugin,
  setDmsAsyncDataScope,
  useDmsUserSession,
} from "#dms/frontend-module";
import {
  asyncDataScopeOf,
  type ScopedSession,
} from "../build/utils/asyncDataScope";

/**
 * Keeps every `useApiData` / `useDmsAsyncData` key in the scope of the
 * session's account and workspace, on both sides before the page renders:
 * the browser finds the data the server transferred under the same scope,
 * and a switch of account or workspace drops the data of the previous one
 * instead of showing it under the new session.
 */
export default defineDmsPlugin(() => {
  const { session } = useDmsUserSession<unknown, ScopedSession>();
  const scope = () => asyncDataScopeOf(session.value);
  setDmsAsyncDataScope(scope());
  // One app per request on a server: its session never changes there.
  if (typeof window === "undefined") return;
  watch(scope, (next) => setDmsAsyncDataScope(next));
});
