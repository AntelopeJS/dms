import { computed, type App } from "vue";
import { createI18n } from "vue-i18n";
import type { DmsAppContext } from "#dms/frontend-module";

/** Fails the test that reaches a member the fixture leaves unimplemented. */
function unused(): never {
  throw new Error("The code under test used an app-context member it must not");
}

/** A vue-i18n composer that holds no messages, for plugins that only install. */
export function emptyTranslations() {
  return createI18n({
    legacy: false,
    locale: "en",
    missingWarn: false,
    fallbackWarn: false,
  }).global;
}

/**
 * The app context a plugin setup receives. Only `vueApp` works: every other
 * member throws when called, so a plugin that starts reading one fails here.
 */
export function dmsAppContext(vueApp: App): DmsAppContext {
  return {
    vueApp,
    provide: unused,
    runWithContext: unused,
    hook: unused,
    $i18n: Object.assign(emptyTranslations(), {
      locales: computed(() => []),
      setLocale: unused,
    }),
  };
}
