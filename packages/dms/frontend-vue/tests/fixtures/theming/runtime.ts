import { usePage } from "@inertiajs/vue3";
import type defaults from "./base/app/app.config";

export type ThemePageProps = {
  config: typeof defaults;
};

/** Supplies the DMS component's config contract from the fixture's Inertia page. */
export function useDmsAppConfig() {
  return usePage<ThemePageProps>().props.config;
}
