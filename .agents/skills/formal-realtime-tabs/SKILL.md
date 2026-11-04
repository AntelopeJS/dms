---
name: formal-realtime-tabs
description: TLA+ model of how a saved record reaches the tabs of one browser through the dms realtime stack (the shared connection one leader tab holds, each tab's session and page subscription, the page's data refresh and the table view's row patch), checked with TLC. Use when a change touches a file in its coverage record, or when a change to realtime, cross-tab coordination, page data refresh or table-view realtime needs proof that no update is lost or shown stale.
---

# Formal check: realtime propagation across tabs

One browser, one user, one backend instance, one page P that shows one record. Tab 1 opens first and tab 2 may open later. The tab holding the `dms-realtime` Web Lock opens `GET /api/realtime/connection` and relays it on a BroadcastChannel. Each tab opens its own session on it (`POST /api/realtime/session`), subscribes that session to P (`POST /api/realtime/subscribe/:pageId`), and shows the record through one consumer, the constant `View`:

- `"page"`: a `useApiData` read that `usePageDataRefresh` reads again on each event of P's topics.
- `"table"`: a table-view row that `patchRowLocal` reads again on each `updated` event of the row topic.

Another user's save commits and publishes its event through `withRealtimeMutation`. The stream can drop, and a tab can close. TLC checks every order of these steps within the bounds below. Each step is the code between two awaits, or one task (a channel message, a timer, a network answer).

- `RealtimeTabsState.tla` holds the constants, variables, `Init` and each tab's handling. `RealtimeTabs.tla` holds the actions, `Next` and the rules. Each condition carries a `\* file.ts:NN` comment.
- Each view has two configurations: `RealtimeTabs<View>.ci.cfg` for CI and `RealtimeTabs<View>.cfg`, the full one.
- `RealtimeTabs.map.mjs`, `chart-one-tab.cfg` and `chart-drop.cfg` are for reading results with `/statechart`.

## Run it

From the repository root, with Node 24 and `pnpm install` done (the runner comes from `@antelopejs/tooling-configs/formal`):

```sh
node .agents/skills/formal-realtime-tabs/check.mjs          # CI configurations
node .agents/skills/formal-realtime-tabs/check.mjs --full   # full configurations
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image. The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` (or `$XDG_CACHE_HOME/antelopejs-formal`) and checks its SHA-256. Each run checks the page view first, then the table view.

| Configuration | Bounds | States (page, table) | Wall time, 4 cores | Wall time, Docker Java 21 |
| --- | --- | --- | --- | --- |
| CI (`.ci.cfg`) | page: two tabs, 1 save, 1 drop while one tab is open, 1 tab close. table: one tab, 2 saves, 1 drop | 45,786, 2,415 | 9.4 to 9.5 s | 10.4 to 10.8 s |
| Full (`.cfg`) | two tabs, 2 saves, 1 drop, 1 tab close, for each view | 11,227,092, 13,267,999 | 5 min 3 s on 8 cores | 3 min 3 s |

The run that checks the rules that hold uses every core it sees, and each finding runs on one worker. The 4- and 8-core times are Java 25 pinned to those cores with `taskset`; the Docker times saw 32 cores. All ran on a shared machine with a load average of 20 to 35. A CI run is mostly the start-up of its 7 TLC runs.

- Exit 0 means every rule that held still holds, and each finding still breaks with its recorded counterexample length.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks. `CHANGED` names a finding whose shortest counterexample changed length. `HOLDS` names a finding that no longer breaks. The script keeps TLC's output in a temporary folder and prints its path. The run stops at the first view that changed, so a change in the page view skips the table view.
- Exit 2 means TLC or Java could not run, or the arguments were wrong.

The lines that name a changed rule match `^(?:BROKEN|CHANGED|HOLDS) +(\w+)`. A rule that still holds prints as lowercase `holds`.

## When to run it

Run `--full` when a change touches a file in the coverage record below, or this folder. A changed rule (exit 1) makes the Verdict FAIL. The recorded findings fail it only when the diff changes what the covered code does, which `dms-control formal` decides by comparing the covered files' JavaScript statements on the base and on HEAD (`verify-dms` verdict rule 5). The CI configurations catch every scratch break in the last section, so they are the ones to run on every push.

## The rules

"Settled" means nothing is in flight: no channel message, request, timer or read is left to run its course until a save, a tab or the network acts.

| Rule | Plain sentence | Harm when it breaks | On main, page | On main, table |
| --- | --- | --- | --- | --- |
| `FollowsPage` | Once settled, every open tab has a live session subscribed to P, and listens to P's topics. | The tab silently stops receiving updates. | holds | holds |
| `ShowsFollowedWrites` | Once settled, every save made while a tab followed P has reached that tab's screen, unless the stream lost its event. | A connected tab misses an update. | holds | holds |
| `NeverGoesBack` | A tab never shows an older version of the record after a newer one. | The user sees a save revert. | holds | finding F3 |
| `ShowsLatest` | Once settled, every open tab shows the record as stored. | A tab shows stale data with no sign of it. | finding F1 | finding F1 |
| `ReconnectCatchesUp` | Once settled, a tab that has followed P shows every save made since, through stream drops and leader-tab handovers. | After a network blip or closing the first tab, the other tabs stay stale. | finding F2 | finding F2 |

`TypeOK` holds too. A tab follows P when its session is live and subscribed to P and its consumer acts on P's events: the page has P's topics, or the table's list has answered. The ghost fields `best`, `followed`, `owed` and `missed` in each tab's record track what a tab has shown and the saves it is owed; no code has them. `check.mjs` records each finding's counterexample length for each configuration. Both configurations have the same lengths: F1 11 states, F2 20, F3 17.

## Findings on main

Each finding was replayed against the real code at the sync commit with a scratch vitest file in `packages/dms/frontend-vue/tests`, run with `pnpm --dir packages/dms/frontend-vue exec vitest run <file>`. It drove the real `useUserRealtime` over the `fakeBrowser` and `realtimeServer` fixtures, the page renderer's `usePageRealtime` + `usePageDataRefresh` + `useApiData` on the real data engine (`fixtures/dataEngine.ts`), and the table view's `useTableViewRowRealtime` + `useTableViewRowEvents`. A save bumped the record and published an `updated` event to the sessions whose last page call was P, as `routes/realtime.ts` does. Each replay also showed the path working once in place: a later save reached the screen, or the newer row read showed first. The replays were not committed.

- **F1, a save during the first subscription is lost (`ShowsLatest`).** The tab takes the stream, learns its connection, opens its session and asks to follow P. Its first read reaches the database and shows v0. Another user saves v1. No session is on P yet, so `applySessionTopics` sends nothing. Then the backend subscribes the session, and the tab takes P's topics. Nothing reads the page again: the tab shows v0 and the database holds v1. The table view breaks the same way, and also when the event arrives before the list answered, since `patchRowLocal` skips a table with no list (tableViewRealtime.ts:55). Replayed for both views: the page and the row stayed at v0.
- **F2, a save during a reconnect is lost (`ReconnectCatchesUp`).** The tab follows P and shows v0. A save of v1 puts its event on the stream, and the stream drops before the leader reads it. The leader retires the stream (publishes null, `resetSession`), reconnects after its backoff, and the tab opens and subscribes a new session. The tab shows v0. With two tabs the leader tab closing does the same to the other tab (21 states). A save made while the stream is down or during the handover is lost the same way. Replayed three ways: the leader tab closing with the event on its stream, a save during the handover, and a save while the stream was down; the page stayed at v0 each time. `watchRealtimeReconnects` (dms-menu-sync.client.ts:13-23) resyncs the menu for this reason, and nothing does it for page data or table rows.
- **F3, a row goes back (`NeverGoesBack`, table).** The list shows v0 and the session follows P. Saves of v1 and v2 each send an `updated` event, and each event's `getRow` reaches the database (v1, then v2). The v2 read answers, then the v1 read answers, and `patchRowLocal` writes it over the row (tableViewRealtime.ts:59-63). The row shows v1, the database holds v2. Replayed by releasing the two row reads in reverse order: the row went from v2 to v1.

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill. Work on a copy of the two `.tla` files, the map and the configs in a scratch folder outside the repo, since it writes its output next to its input. The spec is `RealtimeTabs.tla`, and `RealtimeTabs.map.mjs` is the view. `chart-one-tab.cfg` (one tab, one save, 95 states) draws the whole chart, 20 states and 27 arrows, with F1's path. `chart-drop.cfg` adds a drop (871 states, so the chart shows only the bug paths) and gives F2. For two tabs or the table view, read `RealtimeTabsPage.ci.cfg` or `RealtimeTabsTable.ci.cfg`. `/statechart` counts steps, one fewer than the states `check.mjs` prints. `Done` lets a run end without a deadlock, so its report has `NoDeadlock` among the rules that hold. A new bug shows as a new rule with a path, and a fix shows which paths it removes.

## Real bug or modeling error

Replay the counterexample against the code, one action per step, with the coverage record below, in a scratch vitest file built like the replays above. A step order is a modeling error when the code cannot produce it. The likeliest places are the steps the model makes atomic: a save's commit and its publish, a subscribe request's checks and its subscription, and the assumption that a closed tab's channel messages arrive before the next tab gets the lock. Then fix the model, keep the rule, and say why. Otherwise the finding is real: assert only what a user sees, the record on screen against the record stored.

## Changing the model

- For an intended code change, edit the action that maps to that code, keep the `\* file.ts:NN` comment on each condition and update its line, then rerun both configurations.
- Never weaken or drop a rule to make the check pass. A fixed finding leaves `VIEWS` in `check.mjs` once a replay confirms the fix. A new finding goes into `VIEWS`, for each view and configuration that breaks it, with its counterexample length, and into this file with its replay.
- Keep each file under 20,000 bytes. Keep the CI configurations under a minute on 4 cores, and make them catch each break in the last section.
- After you confirm that the model describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

Paths are under `packages/dms/` unless they name another package. `frontend-module.ts` is `templates/vue/frontend-module.ts` of `@antelopejs/dms-frontend` 0.9.1, a dependency.

| Model action | Code |
| --- | --- |
| `Write` | `withRealtimeMutation` (interface-dms `src/base/table-view/internal/realtime.ts:174-214`), `registerTableViewPageTopics` (same file, 40-46), `PublishMutation` (`src/implementations/dms-base/table-view.ts:517`), `publishTableViewMutation` (`src/realtime/table-view.ts:17-39`), `InMemoryBroker.publish` (`src/realtime/broker.ts:69-82`), the session handler in `applySessionTopics` (`src/routes/realtime.ts:164-167`), the session envelope (`routes/realtime.ts:289-290`) |
| `TakeLead`, `OpenTab` | `electLeader`, `holdLock`, `openTabBus` (`frontend-vue/layers/dms-core/app/build/utils/crossTab.ts:58-158`), `joinSharedRealtimeConnection` and `lead` (`build/utils/sharedRealtimeConnection.ts:269-414`), `connectionStream` (`routes/realtime.ts:233-265`), `registerConnection` (`src/realtime/sessions.ts`) |
| `LeaderReads`, `LeaderSeesDrop`, `LeaderReconnects`, `LeaderReopens` | `connectWithBackoff`, `createReconnector` (`sharedRealtimeConnection.ts:121-229`), `lead`'s `onEvent`, `publish` and reopen handler (`sharedRealtimeConnection.ts:274-346`) |
| `StreamDrops`, `CloseTab` | `openSseStream` close handling (`src/realtime/sse.ts`), the connection's close handler and `cleanupSession` (`routes/realtime.ts:180-184, 254-264`), `unregisterConnection`, `unregisterSession` (`src/realtime/sessions.ts`), `whenReleased`, `endSessionsOf` (`crossTab.ts:164-176`, `sharedRealtimeConnection.ts:279-305`) |
| `TabReceives` | the tab's bus listener (`sharedRealtimeConnection.ts:374-387`), `onConnection` and `onFrame` (`frontend-vue/layers/dms-core/app/composables/realtime/useUserRealtime.ts:318-341`), `dispatchToHandlers` (useUserRealtime.ts:125-172) |
| `SessionServed`, `SessionAnswered`, `TimerFires` | `openSession` (`routes/realtime.ts:275-308`), `openSession`, `adopt`, `resetSession` (useUserRealtime.ts:241-302, 430-436), `reopen` (`sharedRealtimeConnection.ts:405-406`) |
| `StartReconcile`, `SubscribeServed`, `SubscribeAnswered` | `reconcilePage`, `applyDesiredPage`, `callPageEndpoint` (useUserRealtime.ts:374-423, 478-480), `subscribePage`, `ensureSessionOnPage`, `applySessionTopics` (`routes/realtime.ts:145-178, 207-225, 332-364`), `getPageTopics` (`src/realtime/registry.ts:53`), `usePageRealtime` (`composables/realtime/usePageRealtime.ts:45-76`) |
| `OnData` (page), `BurstFires` | `usePageDataRefresh` (`frontend-vue/layers/dms-ui/app/build/composables/live/usePageDataRefresh.ts:29-99`), `useRefreshTriggers` (`build/composables/blocks/useRefreshTriggers.ts`), `useLiveGate` (`build/composables/live/currentPageLive.ts:97-144`), `refreshDmsPageData` and `pageRefresh` (frontend-module.ts:2294-2299, 1593-1600), the page renderer's wiring (`frontend-vue/layers/dms-layout/app/pages/[...slug].vue:218-229`) |
| `RunReads`, `RunAnswers` | `createAsyncDataEntry`'s `start` and `refresh` (frontend-module.ts:1486-1525), `useApiData` (`frontend-vue/layers/dms-core/app/composables/auth/useApiData.ts`) |
| `OnData` (table), `GetReads`, `GetAnswers` | `useTableViewRowRealtime`, `useTableViewRowEvents` (`frontend-vue/layers/dms-ui/app/build/composables/table-view/tableViewRealtime.ts`), `useRealtimeTopic` (`dms-core/app/composables/realtime/useRealtimeTopic.ts`), `getRow` (`table-view/useTableRows.ts:382-385`), the table list's `refreshOnPageRefresh: false` (`table-view/useTableListData.ts:101`) |

The sync commit is `4c96f61d` on AntelopeJS/dms `main`.

## Bounds and what is left out

The full configurations run two tabs, at most 2 saves, 1 stream drop and 1 tab close, for each view. The CI configuration of the page view runs two tabs, 1 save, 1 drop while one tab is open (`CONSTRAINT DropAlone`) and 1 tab close. The table view's runs one tab (`CONSTRAINT OneTab`), 2 saves and 1 drop. A pass covers these bounds only.

The model leaves out:

- more than one backend instance: the Redis broker, and a session request that lands on an instance without the connection, which answers `ok: false`;
- `session-ended` and `renewSession` (a workspace or account switch), presence and its snapshots, the menu and notification topics, and the dev reload signal;
- HTTP failures, 401 recovery, and the browser without Web Locks or BroadcastChannel (a stream per tab);
- pages declared with `live` (Pause, holds, polling while the stream is down), `refreshPageBlocks()`, `created` and `deleted` events (`refreshAll`), and a `useApiData` read with `dedupe: "defer"`;
- navigation to another page (`setPage` with another id), more than two tabs, the 256-frame buffer, and a stray session's close.

Every await is a point where another step may run. The model makes a save's commit and publish one step, and a subscribe request's checks and subscription one step. It assumes the messages a closed tab posted reach the other tab before the leader lock does.

## Confirm the check can fail

Each break was made in a scratch copy of this folder, never in the repo, as the model change a plausible code change implies. The CI configurations caught each one with exit 1.

| Code change | Model change | Caught by the CI run as |
| --- | --- | --- |
| `post` stops delivering to the posting tab's own listeners (crossTab.ts:72-75) | `LeaderReads` leaves the leader's tab unchanged | `BROKEN FollowsPage` |
| the leader stops answering a joining tab's query (sharedRealtimeConnection.ts:310-311) | `TabReceives` drops the query | `BROKEN FollowsPage` |
| the leader relays only its own tab's session frames (sharedRealtimeConnection.ts:335-341) | `LeaderReads` posts no frame | `BROKEN ShowsFollowedWrites` |
| `resetSession` keeps `appliedPageId` (useUserRealtime.ts:432) | `Reset` keeps `applied` | `BROKEN FollowsPage` |
| `applyDesiredPage` drops its session check after the await (useUserRealtime.ts:403) | `SubscribeAnswered` applies any answer | `BROKEN FollowsPage` |
| the page refresh subscribes to the topics it had at setup only (usePageDataRefresh.ts:45-50) | page `OnData` ignores events | `BROKEN ShowsFollowedWrites` |
| every refresh's answer goes on screen (frontend-module.ts:1503) | page `OnData` starts a read that is never aborted | `BROKEN NeverGoesBack` |
| an `updated` event refreshes the counts only (tableViewRealtime.ts:118-121) | table `OnData` ignores events | `BROKEN ShowsFollowedWrites` (table) |
| `ensureSessionOnPage` answers ok without subscribing P's topics (routes/realtime.ts:207-225) | `SubscribeServed` leaves the session off P | `BROKEN FollowsPage` |
| `electLeader` asks with `ifAvailable`, so a waiting tab never leads (crossTab.ts:103-113) | only tab 1 can `TakeLead` | `BROKEN FollowsPage` |
| the leader retires an ended stream without a reconnect (sharedRealtimeConnection.ts:197-204) | `LeaderSeesDrop` sets no retry | `BROKEN FollowsPage` |
