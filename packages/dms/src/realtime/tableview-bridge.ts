import {
  setRealtimeMutationHook,
  setRealtimePageTopicHook,
  setRealtimePresenceHook,
} from "@antelopejs/interface-dms/base/table-view";
import { getPresenceTracker, getRealtimeBroker } from "./current";
import { registerPageTopic } from "./registry";

const TABLEVIEW_ROW_TOPIC_PREFIX = "tableview:row:";
const TABLEVIEW_PRESENCE_TOPIC_PREFIX = "tableview:presence:";

const buildRowTopic = (location: string): string =>
  `${TABLEVIEW_ROW_TOPIC_PREFIX}${location}`;

const buildPresenceTopic = (location: string): string =>
  `${TABLEVIEW_PRESENCE_TOPIC_PREFIX}${location}`;

let isInstalled = false;

export function installTableViewRealtimeBridge(): void {
  if (isInstalled) return;
  isInstalled = true;

  setRealtimeMutationHook(
    async ({ controllerLocation, eventType, ids, sessionId, actor }) => {
      await getRealtimeBroker().publish({
        topic: buildRowTopic(controllerLocation),
        type: eventType,
        payload: { ids },
        actorId: actor?.id,
        ts: Date.now(),
      });
      if (sessionId && (eventType === "updated" || eventType === "deleted")) {
        const presenceTopic = buildPresenceTopic(controllerLocation);
        const tracker = getPresenceTracker();
        await Promise.all(
          ids.map((id) => tracker.release(sessionId, presenceTopic, id)),
        );
      }
    },
  );

  setRealtimePresenceHook(
    async ({ controllerLocation, sessionId, rowId, actor }) => {
      await getPresenceTracker().acquire(
        sessionId,
        buildPresenceTopic(controllerLocation),
        rowId,
        actor,
      );
    },
  );

  setRealtimePageTopicHook(({ pageId, controllerLocation }) => {
    registerPageTopic(pageId, buildRowTopic(controllerLocation));
    registerPageTopic(pageId, buildPresenceTopic(controllerLocation));
  });
}
