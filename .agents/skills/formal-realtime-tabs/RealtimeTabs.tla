---------------------------- MODULE RealtimeTabs ----------------------------
(***************************************************************************)
(* The steps of RealtimeTabsState, `Next`, and the rules SKILL.md lists.   *)
(* Paths are under packages/dms: src/ for the backend, frontend-vue/layers/ *)
(* for the browser; SKILL.md's coverage record gives each file in full.    *)
(***************************************************************************)
EXTENDS RealtimeTabsState

RECURSIVE Ascending(_)
Ascending(S) ==
  IF S = {} THEN <<>>
  ELSE LET m == CHOOSE x \in S : \A y \in S : x <= y IN <<m>> \o Ascending(S \ {m})

(* The data frames write w puts on connection c: one per session of c      *)
(* subscribed to P, each inside a `session` envelope (routes/realtime.ts:  *)
(* 164-167, 289-290). One tenant: isEventForTenant passes.                 *)
FramesFor(c, w) ==
  LET ss == Ascending({s \in Sess : sess[s].alive /\ sess[s].page /\ sess[s].conn = c})
  IN [i \in 1..Len(ss) |-> DataFrame(ss[i], w)]

NewConn(c) == [conn EXCEPT ![c] = [open |-> TRUE, q |-> <<Hello>>]] \* routes/realtime.ts:240-245

(***************************************************************************)
(* The world around the tabs.                                              *)
(***************************************************************************)

(* A write commits, then withRealtimeMutation publishes it               *)
(* (interface-dms table-view/internal/realtime.ts:193, 202); the in-memory *)
(* broker runs every subscriber at once (realtime/broker.ts:69-80). The  *)
(* await between commit and publish is one step here: an event carries no  *)
(* value, so no order inside it changes what a tab reads or receives.     *)
(* A tab that has followed P is owed the write; it missed the event if it *)
(* does not follow P now.                                                 *)
Write ==
  /\ stored < MaxWrites
  /\ stored' = stored + 1
  /\ conn' = [c \in Conns |-> [conn[c] EXCEPT !.q = @ \o FramesFor(c, stored + 1)]]
  /\ tab' = [t \in Tabs |->
               IF Following(t) THEN [tab[t] EXCEPT !.owed = stored + 1, !.missed = FALSE]
               ELSE IF IsOpen(t) /\ tab[t].followed
                    THEN [tab[t] EXCEPT !.owed = stored + 1, !.missed = TRUE]
                    ELSE tab[t]]
  /\ UNCHANGED <<drops, closes, nconn, nsess, sess, lead, chan>>

(* Tab t2 opens on P: it joins the bus, queues for the leader lock behind  *)
(* t1, and asks the leader for its connection (sharedRealtimeConnection.ts: *)
(* 369-392).                                                               *)
OpenTab ==
  /\ tab["t2"].st = "unopened"
  /\ tab' = [tab EXCEPT !["t2"] = OpenedTab]
  /\ chan' = PostTo(chan, "t2", QueryMsg) \* sharedRealtimeConnection.ts:392
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead>>

(* A tab goes. The browser aborts its stream when it led (the backend ends *)
(* its sessions, routes/realtime.ts:254-264) and releases its locks: the  *)
(* leader ends the tab's sessions (sharedRealtimeConnection.ts:279-305,   *)
(* crossTab.ts:164-176), and the next tab leads.                          *)
CloseTab(t) ==
  /\ IsOpen(t)
  /\ closes < MaxCloses
  /\ closes' = closes + 1
  /\ chan' = [chan EXCEPT ![t] = <<>>]
  /\ LET cs == IF lead.tab = t /\ lead.h # 0 THEN {lead.h} ELSE {}
     IN /\ conn' = Shut(cs)
        /\ sess' = Kill(cs, {t})
        /\ tab' = Lose([tab EXCEPT ![t] = GoneTab], cs)
  /\ lead' = IF lead.tab = t THEN NoLead ELSE lead
  /\ UNCHANGED <<stored, drops, nconn, nsess>>

(* The stream breaks: the backend ends the connection and its sessions;    *)
(* frames not yet read are lost.                                           *)
StreamDrops(c) ==
  /\ conn[c].open
  /\ drops < MaxDrops
  /\ drops' = drops + 1
  /\ conn' = Shut({c})
  /\ sess' = Kill({c}, {})
  /\ tab' = Lose(tab, {c})
  /\ UNCHANGED <<stored, closes, nconn, nsess, lead, chan>>

(***************************************************************************)
(* The leader: lead() in sharedRealtimeConnection.ts.                      *)
(***************************************************************************)

(* The leader lock goes to t (crossTab.ts:103-113): to t1 first, to t2 once *)
(* t1 is gone. Assumed: the messages a closed tab posted reach the other   *)
(* tab before the lock does. lead() publishes null, then opens the stream. *)
TakeLead(t) ==
  /\ lead.tab = NoTab
  /\ IsOpen(t)
  /\ t = "t2" => tab["t1"].st = "closed"
  /\ ~IsOpen(Other(t)) => chan[t] = <<>>
  /\ LET c == nconn + 1 IN
     /\ Assert(c <= MaxConns, "MaxConns too small")
     /\ nconn' = c
     /\ conn' = NewConn(c)                                 \* sharedRealtimeConnection.ts:319
     /\ lead' = [tab |-> t, c |-> 0, h |-> c, retry |-> FALSE]
  /\ tab' = [tab EXCEPT ![t] = OnConnection(@, 0)]         \* sharedRealtimeConnection.ts:318
  /\ chan' = PostTo(chan, t, ConnMsg(0))
  /\ UNCHANGED <<stored, drops, closes, nsess, sess>>

(* The leader's stream delivers its next frame. `hello` publishes the     *)
(* connection; a session's frame is relayed with the connection the leader *)
(* published, to every tab, its own at once. A tab drops a frame of the   *)
(* other tab's session on receipt (useUserRealtime.ts:330-340), so the    *)
(* model relays a frame only to the tab whose session it is.             *)
LeaderReads ==
  /\ lead.tab # NoTab
  /\ lead.h # 0
  /\ conn[lead.h].q # <<>>
  /\ LET t == lead.tab
         f == Head(conn[lead.h].q)
         m == FrameMsg(lead.c, f.s, f.w)
     IN /\ conn' = [conn EXCEPT ![lead.h].q = Tail(@)]
        /\ IF f.k = "hello"
           THEN /\ lead' = [lead EXCEPT !.c = lead.h]           \* sharedRealtimeConnection.ts:321-324
                /\ tab' = [tab EXCEPT ![t] = OnConnection(@, lead.h)]
                /\ chan' = PostTo(chan, t, ConnMsg(lead.h))
           ELSE IF lead.c = 0
                THEN UNCHANGED <<lead, tab, chan>>             \* sharedRealtimeConnection.ts:326
                ELSE /\ tab' = [tab EXCEPT ![t] = OnFrame(@, m)] \* sharedRealtimeConnection.ts:335-341
                     /\ chan' = IF sess[f.s].tab = Other(t) THEN PostTo(chan, t, m) ELSE chan
                     /\ UNCHANGED lead
  /\ UNCHANGED <<stored, drops, closes, nconn, nsess, sess>>

(* The stream ends or fails: retire publishes null and schedules a        *)
(* reconnect (sharedRealtimeConnection.ts:197-214, 343).                  *)
LeaderSeesDrop ==
  /\ lead.tab # NoTab
  /\ lead.h # 0
  /\ ~conn[lead.h].open
  /\ lead' = [lead EXCEPT !.h = 0, !.c = 0, !.retry = TRUE]
  /\ tab' = [tab EXCEPT ![lead.tab] = OnConnection(@, 0)]
  /\ chan' = PostTo(chan, lead.tab, ConnMsg(0))
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess>>

(* The backoff timer fires and opens a new stream                         *)
(* (sharedRealtimeConnection.ts:127-133, 187-207).                        *)
LeaderReconnects ==
  /\ lead.tab # NoTab
  /\ lead.retry
  /\ LET c == nconn + 1 IN
     /\ Assert(c <= MaxConns, "MaxConns too small")
     /\ nconn' = c
     /\ conn' = NewConn(c)
     /\ lead' = [lead EXCEPT !.h = c, !.retry = FALSE]
  /\ UNCHANGED <<stored, drops, closes, nsess, sess, chan, tab>>

(* stream.reopen() for a tab whose session request named a connection the  *)
(* backend no longer knows (sharedRealtimeConnection.ts:217-222, 313-315): *)
(* retire, close the stream, reconnect. `ch` is the messages after the step. *)
LeaderReopens(t, r, ch) ==
  /\ lead' = [lead EXCEPT !.h = 0, !.c = 0, !.retry = TRUE]
  /\ conn' = Shut({lead.h})
  /\ sess' = Kill({lead.h}, {})
  /\ LET lost == Lose(tab, {lead.h})
     IN tab' = [lost EXCEPT ![t] = OnConnection([r EXCEPT !.missed = lost[t].missed], 0)]
  /\ chan' = PostTo(ch, t, ConnMsg(0))

(***************************************************************************)
(* Each tab: joinSharedRealtimeConnection, connectTab, the page calls.    *)
(***************************************************************************)

(* The next BroadcastChannel message reaches tab t. *)
TabReceives(t) ==
  /\ IsOpen(t)
  /\ chan[t] # <<>>
  /\ LET m == Head(chan[t])
         ch == [chan EXCEPT ![t] = Tail(@)]
     IN CASE m.k = "conn" ->
               /\ tab' = [tab EXCEPT ![t] = OnConnection(@, m.c)]
               /\ chan' = ch
               /\ UNCHANGED <<lead, conn, sess>>
          [] m.k = "frame" ->
               /\ tab' = [tab EXCEPT ![t] = OnFrame(@, m)]
               /\ chan' = ch
               /\ UNCHANGED <<lead, conn, sess>>
          [] m.k = "query" ->                                  \* sharedRealtimeConnection.ts:310-311
               /\ chan' = IF lead.tab = t THEN PostTo(ch, t, ConnMsg(lead.c)) ELSE ch
               /\ UNCHANGED <<lead, conn, sess, tab>>
          [] m.k = "reopen" ->
               IF lead.tab = t /\ m.c = lead.c /\ lead.h # 0
               THEN LeaderReopens(t, tab[t], ch)
               ELSE /\ chan' = ch
                    /\ UNCHANGED <<lead, conn, sess, tab>>
  /\ UNCHANGED <<stored, drops, closes, nconn, nsess>>

(* POST /session reaches the backend: a session on a connection it knows,  *)
(* else `ok: false` (routes/realtime.ts:281-301).                          *)
SessionServed(t) ==
  /\ IsOpen(t)
  /\ tab[t].ask.ph = "sent"
  /\ LET c == tab[t].ask.c
         s == nsess + 1
     IN IF conn[c].open
        THEN /\ Assert(s <= MaxSess, "MaxSess too small")
             /\ nsess' = s
             /\ sess' = [sess EXCEPT ![s] = [conn |-> c, tab |-> t, alive |-> TRUE, page |-> FALSE]]
             /\ tab' = [tab EXCEPT ![t].ask = [ph |-> "answered", c |-> c, s |-> s]]
        ELSE /\ tab' = [tab EXCEPT ![t].ask = [ph |-> "answered", c |-> c, s |-> 0]]
             /\ UNCHANGED <<nsess, sess>>
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, lead, chan>>

(* The tab reads the answer of its current attempt. `ok: false` schedules  *)
(* a reopen on the tab's one retry timer, which ignores a schedule while   *)
(* armed (useUserRealtime.ts:294-299, sharedRealtimeConnection.ts:128). A *)
(* session is adopted, and onConnected reconciles the page                *)
(* (useUserRealtime.ts:241-252, 478-480).                                  *)
SessionAnswered(t) ==
  /\ IsOpen(t)
  /\ tab[t].ask.ph = "answered"
  /\ LET r == tab[t]
         a == r.ask
     IN tab' = [tab EXCEPT ![t] =
          IF a.s = 0
          THEN [r EXCEPT !.ask = NoAsk, !.timer = IF r.timer = 0 THEN a.c ELSE r.timer]
          ELSE [r EXCEPT !.ask = NoAsk, !.sid = a.s, !.reconcile = TRUE]]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(* The retry timer fires: if its attempt is still current, the tab asks   *)
(* the leader to reopen (useUserRealtime.ts:296-298, sharedRealtimeConnection.ts:405-406). *)
TimerFires(t) ==
  /\ IsOpen(t)
  /\ tab[t].timer # 0
  /\ LET c == tab[t].timer
         r == [tab[t] EXCEPT !.timer = 0]
     IN IF c # tab[t].conn
        THEN /\ tab' = [tab EXCEPT ![t] = r]
             /\ UNCHANGED <<lead, conn, sess, chan>>
        ELSE IF lead.tab = t
             THEN IF lead.h # 0
                  THEN LeaderReopens(t, r, chan)
                  ELSE /\ tab' = [tab EXCEPT ![t] = r]
                       /\ UNCHANGED <<lead, conn, sess, chan>>
             ELSE /\ tab' = [tab EXCEPT ![t] = r]
                  /\ chan' = PostTo(chan, t, ReopenMsg(c))
                  /\ UNCHANGED <<lead, conn, sess>>
  /\ UNCHANGED <<stored, drops, closes, nconn, nsess>>

(* reconcilePage runs its next applyDesiredPage once the previous one     *)
(* settled (useUserRealtime.ts:393-423).                                   *)
StartReconcile(t) ==
  /\ IsOpen(t)
  /\ tab[t].reconcile
  /\ tab[t].sub.ph = "none"
  /\ LET r == tab[t] IN
     tab' = [tab EXCEPT ![t] =
       IF r.applied \/ r.sid = 0                             \* useUserRealtime.ts:399-400
       THEN [r EXCEPT !.reconcile = FALSE]
       ELSE [r EXCEPT !.reconcile = FALSE, !.sub = [ph |-> "sent", s |-> r.sid, ok |-> FALSE]]]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(* POST /subscribe/P: the backend puts a live session on P and subscribes  *)
(* it to P's topics before it answers (routes/realtime.ts:343-363, 207-225). *)
SubscribeServed(t) ==
  /\ IsOpen(t)
  /\ tab[t].sub.ph = "sent"
  /\ LET s == tab[t].sub.s
         ok == sess[s].alive
         ss == IF ok THEN [sess EXCEPT ![s].page = TRUE] ELSE sess
     IN /\ sess' = ss
        /\ tab' = [tab EXCEPT ![t] = Mark([@ EXCEPT !.sub = [ph |-> "answered", s |-> s, ok |-> ok]], ss)]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, lead, chan>>

(* The tab reads the answer: for its current session it marks P applied  *)
(* and takes the topics, none on `ok: false`; the page refresh then       *)
(* listens to them (useUserRealtime.ts:390, 401-405).                     *)
SubscribeAnswered(t) ==
  /\ IsOpen(t)
  /\ tab[t].sub.ph = "answered"
  /\ LET r == tab[t] IN
     tab' = [tab EXCEPT ![t] =
       IF r.sub.s = r.sid
       THEN Mark([r EXCEPT !.sub = NoSub, !.applied = TRUE, !.topics = r.sub.ok], sess)
       ELSE [r EXCEPT !.sub = NoSub]]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(***************************************************************************)
(* The record on screen.                                                   *)
(***************************************************************************)

(* The burst timer fires: refreshDmsPageData starts a new read, which     *)
(* aborts the one in flight (usePageDataRefresh.ts:87-89; dms-frontend    *)
(* frontend-module.ts:1486-1488, 1593-1600).                              *)
BurstFires(t) ==
  /\ IsOpen(t)
  /\ tab[t].burst
  /\ tab' = [tab EXCEPT ![t].burst = FALSE, ![t].run = RunSent]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(* The read in flight (the page's data, or the table's list) reaches the  *)
(* database.                                                               *)
RunReads(t) ==
  /\ IsOpen(t)
  /\ tab[t].run.ph = "sent"
  /\ tab' = [tab EXCEPT ![t].run = [ph |-> "read", v |-> stored]]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(* Its answer goes on screen: only the newest run's does                  *)
(* (frontend-module.ts:1503-1504).                                         *)
RunAnswers(t) ==
  /\ IsOpen(t)
  /\ tab[t].run.ph = "read"
  /\ LET r == tab[t] IN tab' = [tab EXCEPT ![t] = Mark(Show([r EXCEPT !.run = NoRun], r.run.v), sess)]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(* patchRowLocal's `getRow` for write w's event reaches the database. *)
GetReads(t, w) ==
  /\ IsOpen(t)
  /\ tab[t].gets[w].ph = "sent"
  /\ tab' = [tab EXCEPT ![t].gets[w] = [ph |-> "read", v |-> stored]]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(* Its answer replaces the row, whatever answered before                  *)
(* (tableViewRealtime.ts:59-63).                                           *)
GetAnswers(t, w) ==
  /\ IsOpen(t)
  /\ tab[t].gets[w].ph = "read"
  /\ LET r == tab[t] IN
     tab' = [tab EXCEPT ![t] = Mark(Show([r EXCEPT !.gets[w] = NoRun], r.gets[w].v), sess)]
  /\ UNCHANGED <<stored, drops, closes, nconn, conn, nsess, sess, lead, chan>>

(***************************************************************************)
(* Next and the rules.                                                     *)
(***************************************************************************)

Internal ==
  \/ LeaderReads \/ LeaderSeesDrop \/ LeaderReconnects
  \/ \E t \in Tabs :
       \/ TakeLead(t) \/ TabReceives(t) \/ SessionServed(t) \/ SessionAnswered(t)
       \/ TimerFires(t) \/ StartReconcile(t) \/ SubscribeServed(t) \/ SubscribeAnswered(t)
       \/ BurstFires(t) \/ RunReads(t) \/ RunAnswers(t)
       \/ \E w \in Writes : GetReads(t, w) \/ GetAnswers(t, w)

Environment ==
  \/ Write \/ OpenTab
  \/ \E t \in Tabs : CloseTab(t)
  \/ \E c \in Conns : StreamDrops(c)

(* Every bound is used and nothing is in flight: the run is over. *)
Done == ~ENABLED (Internal \/ Environment) /\ UNCHANGED vars

Next == Internal \/ Environment \/ Done

Spec == Init /\ [][Next]_vars

(* Nothing is left to happen until a write, a tab, or the network acts:   *)
(* every message, request, timer and read has run its course.            *)
Settled == ~ENABLED Internal

OpenTabs == {t \in Tabs : IsOpen(t)}

ShowsStored == \A t \in OpenTabs : tab[t].loaded /\ tab[t].shown = stored

(* Once settled, every open tab shows the record as stored. *)
ShowsLatest == Settled => ShowsStored

(* Once settled, every write made while a tab followed P has reached that *)
(* tab's screen, unless the stream lost its event.                        *)
ShowsFollowedWrites == Settled => \A t \in OpenTabs : tab[t].missed \/ tab[t].owed = 0

(* Once settled, a tab that has followed P shows every write made since,  *)
(* the ones a stream drop or a leader handover kept from it included.     *)
ReconnectCatchesUp == Settled => \A t \in OpenTabs : tab[t].owed = 0

(* A tab never shows an older version of the record after a newer one. *)
NeverGoesBack == \A t \in Tabs : tab[t].shown = tab[t].best

(* Once settled, every open tab has a live session subscribed to P, and   *)
(* its page refresh listens to P's topics.                                *)
FollowsPage ==
  Settled => \A t \in OpenTabs :
               LET s == tab[t].sid
               IN s # 0 /\ sess[s].alive /\ sess[s].page /\ tab[t].applied /\ tab[t].topics

(* CI and chart bounds. DropAlone (RealtimeTabsPage.ci.cfg): a stream    *)
(* drops only while one tab is open. OneTab (RealtimeTabsTable.ci.cfg and *)
(* the chart configs): tab 2 never opens.                                 *)
DropAlone == drops = 0 \/ ~(IsOpen("t1") /\ IsOpen("t2"))
OneTab == tab["t2"].st = "unopened"
=============================================================================
