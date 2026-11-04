/**
 * The `storage-key` of the dashboard's `UDashboardGroup`. Nuxt UI keeps the
 * sidebar's width and folded state in a `<key>-sidebar-<id>` cookie. Sizes
 * are in px (the v2 240px sidebar): the key changed with the unit, so a width
 * saved in % is not read back as px.
 */
export const DASHBOARD_STORAGE_KEY = "dms-dashboard";
