import type { DmsAppContext } from "#dms/frontend-module";

type AppContextRunner = Pick<DmsAppContext, "runWithContext">;

/**
 * A plugin whose file loads on demand. The renderer runs a plugin's setup inside
 * the app's context, which ends at the first `await`, so the loaded plugin runs
 * inside it again: a composable that injects (`useToast`, `useDmsState`) fails
 * outside it and, in a plugin, stops the app from hydrating.
 */
export function lazyPlugin<Context extends AppContextRunner>(
  load: () => Promise<{ default: (context: Context) => unknown }>,
): (context: Context) => Promise<void> {
  return async (context) => {
    const plugin = await load();
    await context.runWithContext(() => plugin.default(context));
  };
}
