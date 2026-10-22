import { defineDmsPlugin } from "#dms/frontend-module";

/**
 * Logs, in development, every error Vue catches before the renderer's own
 * handler takes it. That handler only keeps the error for the error page, so
 * a render that throws showed its bare message there ("ERROR 500 · Must be
 * called at the top of a `setup` function") with no stack in any console.
 */
export default defineDmsPlugin(({ vueApp }) => {
  if (!import.meta.env.DEV) return;
  const handleError = vueApp.config.errorHandler;
  vueApp.config.errorHandler = (error, instance, info) => {
    console.error(`[dms] Uncaught error (${info})`, error);
    handleError?.(error, instance, info);
  };
});
