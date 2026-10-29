const HOME = "/examples/overview";
const FEATURES = "/examples/features";
const NOTIFICATIONS = "/dms/pages/settings/user/notifications";

async function signedIn(ctx) {
  const tab = await ctx.tab("admin");
  await tab.signIn("admin");
  return tab;
}

/** The dashboard around every page: sidebar, header, command palette, favorites, notifications, error pages. */
export const journeys = [
  {
    id: "sidebar-navigation",
    title: "the sidebar opens a page, the breadcrumb names it, and a reload stays on it",
    entryPoint: "sidebar navigation and breadcrumb",
    async run(ctx) {
      const tab = await signedIn(ctx);
      await ctx.verify("signing in lands on the configured homepage", [tab.at(new RegExp(`^${HOME}$`))]);
      await tab.click({ role: "link", name: "Feature index", within: { role: "navigation" } });
      await ctx.verify("the page opens with its breadcrumb", [
        tab.at(new RegExp(`^${FEATURES}$`)),
        tab.visible({ role: "link", name: "Feature index", within: { role: "navigation", name: "Breadcrumb" } }),
      ]);
      await tab.reload();
      await ctx.verify("a reload stays on the page", [tab.at(new RegExp(`^${FEATURES}$`))]);
    },
  },
  {
    id: "command-palette-navigates",
    title: "Ctrl K searches pages and Enter opens the first match",
    entryPoint: "command palette (Ctrl K)",
    async run(ctx) {
      const tab = await signedIn(ctx);
      await tab.press("Control+k");
      await ctx.verify("the palette opens", [tab.visible({ role: "dialog", name: "Search" })]);
      await tab.fill({ role: "textbox", name: "Type a command or search…" }, "Member invitations");
      await ctx.verify("the search lists the settings page first", [
        tab.visible({ role: "option", name: /^Member invitations/, within: { role: "listbox" } }),
      ]);
      await tab.press("Enter");
      await ctx.verify("Enter opens the page", [tab.at(/^\/settings\/workspace\/invites$/)]);
    },
  },
  {
    id: "command-palette-no-match",
    title: "a palette search that matches nothing shows no option and opens nothing",
    entryPoint: "command palette (Ctrl K), empty result",
    async run(ctx) {
      const tab = await signedIn(ctx);
      await tab.press("Control+k");
      await tab.fill({ role: "textbox", name: "Type a command or search…" }, "qqxzjjwv");
      await ctx.verify("no option matches", [tab.count({ role: "option" }, 0), tab.shows(/No matching data/)]);
      await tab.press("Enter");
      await ctx.verify("Enter leaves the page where it was", [tab.at(new RegExp(`^${HOME}$`))]);
    },
  },
  {
    id: "favorites-persist",
    title: "a favorite page appears in the sidebar, survives a reload and a new tab, and can be removed",
    entryPoint: "page header > Add to favorites",
    async run(ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(FEATURES);
      await tab.click({ role: "button", name: "Add to favorites" });
      await tab.reload();
      await ctx.verify("the favorite is in the sidebar after a reload", [
        tab.visible({ role: "link", name: "Feature index", within: { role: "region", name: "Favorites" } }),
      ]);
      const other = await ctx.tab("admin", "second-tab");
      await other.goto(HOME);
      await ctx.verify("another tab of the same browser shows it", [
        other.visible({ role: "link", name: "Feature index", within: { role: "region", name: "Favorites" } }),
      ]);
      await tab.click({ role: "button", name: "Remove from favorites" });
      await tab.reload();
      await ctx.verify("removing it empties the favorites", [
        tab.visible({ role: "region", name: "Favorites" }, { hidden: true }),
      ]);
    },
  },
  {
    id: "sign-in-notification",
    title: "signing in from a new device puts a notification behind the bell, which opens the inbox",
    entryPoint: "header > Notifications",
    async run(ctx) {
      const tab = await signedIn(ctx);
      await tab.click({ role: "button", name: "Notifications" });
      await ctx.verify("the bell lists the new sign-in", [
        tab.visible({ role: "dialog", name: "Notifications" }),
        tab.shows(/New sign-in from/),
      ]);
      await tab.click({ role: "button", name: "View all notifications" });
      await ctx.verify("View all opens the notification settings", [tab.at(/^\/settings\/user\/notifications$/)]);
      const unread = await ctx.api("read the unread count", { method: "GET", path: `${NOTIFICATIONS}/unread-count` });
      const list = await ctx.api("read the notifications", { method: "GET", path: `${NOTIFICATIONS}/list` });
      const signIns = (Array.isArray(list.body) ? list.body : []).filter((entry) => entry.icon === "i-ph-sign-in");
      await ctx.verify("the API holds the unread sign-in notification", [
        ctx.holds("at least one unread", unread.body?.count >= 1, JSON.stringify(unread.body)),
        ctx.holds("a sign-in notification linking to Security", signIns.some((entry) => entry.linkTo === "/settings/user/security" && !entry.isRead), JSON.stringify(signIns)),
      ]);
    },
  },
  {
    id: "unknown-page-404",
    title: "an unknown path shows the 404 page with a way home",
    entryPoint: "any unknown URL",
    async run(ctx) {
      const tab = await signedIn(ctx);
      await tab.goto("/no-such-page-here");
      await ctx.verify("the 404 page explains and offers a way out", [
        tab.visible({ role: "heading", name: "Page not found" }),
        tab.shows(/Error 404/i),
      ]);
      await tab.click({ role: "button", name: "Go to home" });
      await ctx.verify("Go to home opens the homepage", [tab.at(new RegExp(`^${HOME}$`))]);
    },
  },
];
