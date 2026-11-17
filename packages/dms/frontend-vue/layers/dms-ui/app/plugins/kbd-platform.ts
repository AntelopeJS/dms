import { useKeyboardPlatform } from "../composables/global/keyboardPlatform";

/**
 * Nuxt UI's key hints (`<UKbd value="meta">`, the `kbds` of its menus, the
 * dashboard search button) print `meta`, `ctrl` and `alt` for the keyboard
 * platform the dashboard's own hints use: the cookie's, read in each hint's
 * setup, so a hint hydrating the server's page keeps the platform the server
 * printed until it is mounted (`useKeyboardPlatform`). Without it they print
 * a blank on the server and fill it in once mounted.
 */
export default defineDmsPlugin(({ vueApp }) => {
  provideDmsKbdPlatform(vueApp, () => useKeyboardPlatform().platform);
});
