------------------------- MODULE RealtimeTabsState -------------------------
(***************************************************************************)
(* How a write to one record reaches the tabs of one browser that show it, *)
(* as the code at the sync commit in SKILL.md runs it.                     *)
(*                                                                         *)
(* One browser, one user, one tenant, one backend instance, one page P    *)
(* that shows the record. Tab t1 opens first; t2 may open later. Each tab *)
(* joins the shared connection (sharedRealtimeConnection.ts), opens its   *)
(* own session on it (useUserRealtime.ts), subscribes that session to P,  *)
(* and shows the record through one consumer, the constant View:          *)
(*   "page"  a `useApiData` read, refreshed by usePageDataRefresh.ts;      *)
(*   "table" a table-view row, patched by tableViewRealtime.ts.            *)
(* Writes come from elsewhere: another user, or another browser.          *)
(*                                                                         *)
(* Each step is the code between two awaits, or one task (a BroadcastChannel *)
(* message, a timer, a network answer). A tab's `bus.post` delivers to its *)
(* own listeners synchronously (crossTab.ts:72-75), so a leader's relay   *)
(* changes its own tab within the same step.                               *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS View, MaxWrites, MaxDrops, MaxCloses

Tabs == {"t1", "t2"}
Other(t) == IF t = "t1" THEN "t2" ELSE "t1"
NoTab == "none"
Views == {"page", "table"}
ASSUME View \in Views
Versions == 0..MaxWrites
Writes == 1..MaxWrites
\* Every new stream follows the first one, a drop, or the leader's tab closing.
MaxConns == 1 + MaxDrops + MaxCloses
Conns == 1..MaxConns
\* A tab asks for one session per connection it learns.
MaxSess == 2 * MaxConns
Sess == 1..MaxSess

Hello == [k |-> "hello", s |-> 0, w |-> 0]
DataFrame(s, w) == [k |-> "data", s |-> s, w |-> w]
Frames == {Hello} \cup {DataFrame(s, w) : s \in Sess, w \in Writes}

ConnMsg(c) == [k |-> "conn", c |-> c, s |-> 0, w |-> 0]
FrameMsg(c, s, w) == [k |-> "frame", c |-> c, s |-> s, w |-> w]
QueryMsg == [k |-> "query", c |-> 0, s |-> 0, w |-> 0]
ReopenMsg(c) == [k |-> "reopen", c |-> c, s |-> 0, w |-> 0]
Msgs == {ConnMsg(c) : c \in 0..MaxConns} \cup {QueryMsg}
        \cup {FrameMsg(c, s, w) : c \in Conns, s \in Sess, w \in Writes}
        \cup {ReopenMsg(c) : c \in Conns}

NoAsk == [ph |-> "none", c |-> 0, s |-> 0]
AskSent(c) == [ph |-> "sent", c |-> c, s |-> 0]
NoSub == [ph |-> "none", s |-> 0, ok |-> FALSE]
NoRun == [ph |-> "none", v |-> 0]
RunSent == [ph |-> "sent", v |-> 0]
DeadSession == [conn |-> 0, tab |-> NoTab, alive |-> FALSE, page |-> FALSE]

(* `best`, `followed`, `owed` and `missed` are no code's. `best`: the     *)
(* newest version the tab has shown. `followed`: the tab has followed P   *)
(* (see Following) since it opened. `owed`: the newest write made since, *)
(* which its screen has not reached. `missed`: the tab could not hear    *)
(* that write's event, which the stream lost, or which came while the    *)
(* tab did not follow P.                                                  *)
UnopenedTab == [st |-> "unopened", conn |-> 0, sid |-> 0, ask |-> NoAsk,
              timer |-> 0, applied |-> FALSE, topics |-> FALSE, sub |-> NoSub,
              reconcile |-> FALSE, run |-> NoRun, burst |-> FALSE,
              gets |-> [w \in Writes |-> NoRun], loaded |-> FALSE,
              shown |-> 0, best |-> 0, followed |-> FALSE, owed |-> 0, missed |-> FALSE]
\* The page mounts: its data read leaves (useApiData, or the table's list),
\* and setPage(P) finds no session yet (usePageRealtime.ts:55-63).
OpenedTab == [UnopenedTab EXCEPT !.st = "open", !.run = RunSent]
\* A tab that went keeps nothing the model reads.
GoneTab == [UnopenedTab EXCEPT !.st = "closed"]

VARIABLES
  stored,  \* the record's version in the database
  drops,   \* streams dropped so far (bound)
  closes,  \* tabs closed so far (bound)
  nconn,   \* connections the backend registered so far
  conn,    \* backend: is each connection open, and the frames it still has to deliver
  nsess,   \* sessions the backend registered so far
  sess,    \* backend: each session's connection, tab, liveness and page subscription
  lead,    \* the leader tab's lead(): its connectionId, active stream, reconnect timer
  chan,    \* BroadcastChannel messages on their way to each tab, in order
  tab      \* each tab's state: see UnopenedTab

vars == <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan, tab>>

NoLead == [tab |-> NoTab, c |-> 0, h |-> 0, retry |-> FALSE]

Init ==
  /\ stored = 0
  /\ drops = 0
  /\ closes = 0
  /\ nconn = 0
  /\ conn = [c \in Conns |-> [open |-> FALSE, q |-> <<>>]]
  /\ nsess = 0
  /\ sess = [s \in Sess |-> DeadSession]
  /\ lead = NoLead
  /\ chan = [t \in Tabs |-> <<>>]
  /\ tab = [t \in Tabs |-> IF t = "t1" THEN OpenedTab ELSE UnopenedTab]

IsOpen(t) == tab[t].st = "open"
Max(a, b) == IF a >= b THEN a ELSE b

(***************************************************************************)
(* A tab's own handling, as functions of its state record.                *)
(***************************************************************************)

(* resetSession: the server's session is gone, forget what it held. *)
Reset(r) == [r EXCEPT !.sid = 0, !.applied = FALSE, !.topics = FALSE] \* useUserRealtime.ts:430-436

(* The tab's listener on a `connection` message, then onConnection. A new    *)
(* openSession makes any attempt in flight stale (its answer only closes   *)
(* the stray session), so the record keeps the newest attempt alone.       *)
OnConnection(r, next) ==
  IF next = r.conn THEN r                                         \* sharedRealtimeConnection.ts:379
  ELSE LET r1 == IF r.sid # 0 THEN Reset(r) ELSE r                \* useUserRealtime.ts:320, 481
       IN [r1 EXCEPT !.conn = next,                               \* useUserRealtime.ts:322
                     !.ask = IF next # 0 THEN AskSent(next) ELSE NoAsk] \* useUserRealtime.ts:323, 264-272

(* An event of P's topics reaches the consumer of the record. *)
OnData(r, w) ==
  IF View = "page"
  \* The page refresh listens to P's topics only once the subscription
  \* answered them (usePageDataRefresh.ts:45-50); then it arms the burst
  \* timer through the live gate, which a page without `live` passes
  \* (usePageDataRefresh.ts:37-38, currentPageLive.ts:129-133).
  THEN IF r.topics THEN [r EXCEPT !.burst = TRUE] ELSE r
  \* The row topic handler is on from mount (tableViewRealtime.ts:137-150);
  \* patchRowLocal skips a table whose list has not answered yet
  \* (tableViewRealtime.ts:55), else reads the row (tableViewRealtime.ts:59).
  ELSE IF r.loaded THEN [r EXCEPT !.gets[w] = RunSent] ELSE r

(* A relayed frame: the tab's listener keeps frames of the connection it   *)
(* knows (sharedRealtimeConnection.ts:384-386), onFrame those of its own   *)
(* session (useUserRealtime.ts:330-336). A frame of a session the tab has *)
(* not adopted is buffered and dropped at adopt (useUserRealtime.ts:338-340, *)
(* 246-248): no frame of P can be one, since only an adopted session can   *)
(* subscribe to P.                                                         *)
OnFrame(r, m) == IF m.c = r.conn /\ m.s = r.sid THEN OnData(r, m.w) ELSE r

(* The data a run or a row read answered goes on screen. A write owed is  *)
(* forgotten once the screen reached it.                                  *)
Show(r, v) ==
  LET best == Max(r.best, v)
      paid == best >= r.owed
  IN [r EXCEPT !.shown = v, !.loaded = TRUE, !.best = best,
               !.owed = IF paid THEN 0 ELSE r.owed, !.missed = r.missed /\ ~paid]

(* A tab with state r follows P, sessions being ss: its session is live   *)
(* and subscribed to P, and the consumer acts on P's events (OnData).     *)
FollowingIn(r, ss) ==
  /\ r.st = "open"
  /\ r.sid # 0 /\ ss[r.sid].alive /\ ss[r.sid].page
  /\ IF View = "page" THEN r.topics ELSE r.loaded
Following(t) == FollowingIn(tab[t], sess)
(* Records that the tab follows P, at the steps that can start it. *)
Mark(r, ss) == IF FollowingIn(r, ss) THEN [r EXCEPT !.followed = TRUE] ELSE r

(***************************************************************************)
(* The backend side of connections closing: sse.ts close handlers run     *)
(* unregisterConnection and cleanupSession for their sessions             *)
(* (routes/realtime.ts:254-264, sessions.ts:96). A tab that goes has the  *)
(* leader end its sessions (sharedRealtimeConnection.ts:279-305).         *)
(***************************************************************************)
Shut(cs) == [c \in Conns |-> IF c \in cs THEN [open |-> FALSE, q |-> <<>>] ELSE conn[c]]
Kill(cs, ts) ==
  [s \in Sess |-> IF sess[s].conn \in cs \/ sess[s].tab \in ts THEN DeadSession ELSE sess[s]]

(* Closing the connections cs loses the frames still on them, the event  *)
(* of a tab's owed write among them.                                      *)
Queued(s) == \E c \in Conns : \E i \in DOMAIN conn[c].q : conn[c].q[i].s = s
Lose(tb, cs) ==
  [t \in Tabs |-> IF tb[t].owed # 0 /\ tb[t].sid # 0 /\ sess[tb[t].sid].conn \in cs
                     /\ Queued(tb[t].sid)
                  THEN [tb[t] EXCEPT !.missed = TRUE] ELSE tb[t]]

(* bus.post from tab t onto the messages `ch` still on their way. *)
PostTo(ch, t, m) ==
  [ch EXCEPT ![Other(t)] = IF IsOpen(Other(t)) THEN Append(@, m) ELSE @]

TypeOK ==
  /\ stored \in Versions
  /\ nconn \in 0..MaxConns
  /\ nsess \in 0..MaxSess
  /\ lead.tab \in Tabs \cup {NoTab}
  /\ lead.c \in 0..MaxConns /\ lead.h \in 0..MaxConns
  /\ \A c \in Conns : \A i \in DOMAIN conn[c].q : conn[c].q[i] \in Frames
  /\ \A t \in Tabs : \A i \in DOMAIN chan[t] : chan[t][i] \in Msgs
  /\ \A t \in Tabs : {tab[t].shown, tab[t].best, tab[t].owed} \subseteq Versions /\ tab[t].missed \in BOOLEAN
=============================================================================
