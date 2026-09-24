import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  forgetRealtimePageTopics,
  reportRealtimePageTopic,
} from "@antelopejs/interface-dms/base/table-view/realtime";
import { ExecuteHooks, Hook } from "@antelopejs/interface-dms/hooks";
import * as notificationsInterface from "@antelopejs/interface-dms/notifications";
import {
  RegisterBuiltInNotifications,
  SystemCategory,
} from "@antelopejs/interface-dms/notifications";
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import { createOwnedHooks } from "../../hooks/owned-hooks";
import * as notificationsImpl from "../../implementations/dms-notifications";
import { clearPageTopics, getPageTopics } from "../../realtime/registry";
import {
  installTableViewRealtimeBridge,
  uninstallTableViewRealtimeBridge,
} from "../../realtime/tableview-bridge";

// A hot reload destroys the DMS module generation, then constructs the next
// one in the same process. What the old generation left in the shared
// interface package — hooks, handlers, registrations — either has to be
// released with it or come back with the new one.

const KEPT_PAGE = "generation.kept";
const AWAY_PAGE = "generation.reported-while-away";
const GONE_PAGE = "generation.gone";
const KEPT_LOCATION = "/api/generation-kept";
const AWAY_LOCATION = "/api/generation-away";
const GONE_LOCATION = "/api/generation-gone";

const rowTopic = (location: string): string => `tableview:row:${location}`;

describe("[unit] module generation teardown", () => {
  describe("table-view realtime bridge", () => {
    afterEach(() => {
      for (const pageId of [KEPT_PAGE, AWAY_PAGE, GONE_PAGE]) {
        forgetRealtimePageTopics(pageId);
        clearPageTopics(pageId);
      }
      installTableViewRealtimeBridge();
    });

    it("hands the next bridge every topic, including those reported while it was away", () => {
      installTableViewRealtimeBridge();
      reportRealtimePageTopic({
        pageId: KEPT_PAGE,
        controllerLocation: KEPT_LOCATION,
      });
      uninstallTableViewRealtimeBridge();
      // The next generation starts from an empty topic registry.
      clearPageTopics(KEPT_PAGE);
      reportRealtimePageTopic({
        pageId: AWAY_PAGE,
        controllerLocation: AWAY_LOCATION,
      });
      expect([...getPageTopics(AWAY_PAGE)]).to.deep.equal([]);

      installTableViewRealtimeBridge();

      expect([...getPageTopics(KEPT_PAGE)]).to.include(rowTopic(KEPT_LOCATION));
      expect([...getPageTopics(AWAY_PAGE)]).to.include(rowTopic(AWAY_LOCATION));
    });

    it("does not hand it the topics of a page that went away", () => {
      installTableViewRealtimeBridge();
      reportRealtimePageTopic({
        pageId: GONE_PAGE,
        controllerLocation: GONE_LOCATION,
      });
      forgetRealtimePageTopics(GONE_PAGE);
      clearPageTopics(GONE_PAGE);
      uninstallTableViewRealtimeBridge();

      installTableViewRealtimeBridge();

      expect([...getPageTopics(GONE_PAGE)]).to.deep.equal([]);
    });
  });

  describe("owned hooks", () => {
    it("stops calling the hooks of a released scope", async () => {
      const scope = createOwnedHooks();
      let calls = 0;
      scope.register(Hook.DATABASE_INITIALIZED, async () => {
        calls += 1;
        return undefined;
      });

      await ExecuteHooks(Hook.DATABASE_INITIALIZED);
      scope.release();
      await ExecuteHooks(Hook.DATABASE_INITIALIZED);

      expect(calls).to.equal(1);
    });
  });

  describe("built-in notifications", () => {
    const probe: NotificationSubjectInfo = {
      id: "generation-probe",
      category: SystemCategory,
      labelKey: "generation.probe",
      togglePermission: "default",
    };

    before(() => {
      ImplementInterface(notificationsInterface, notificationsImpl);
      RegisterBuiltInNotifications();
    });

    after(() => {
      notificationsInterface.internal.RegisterNotificationSubject.unregister(
        probe,
      );
      RegisterBuiltInNotifications();
    });

    it("registers the system category again for the next generation", () => {
      notificationsInterface.internal.RegisterNotificationCategory.unregister(
        SystemCategory,
      );
      expect(() =>
        notificationsInterface.internal.RegisterNotificationSubject.register(
          probe,
        ),
      ).to.throw(/is not registered/);

      RegisterBuiltInNotifications();

      expect(() =>
        notificationsInterface.internal.RegisterNotificationSubject.register(
          probe,
        ),
      ).not.to.throw();
    });
  });
});
