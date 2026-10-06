import {
  Context,
  Get,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { ActivityFeed } from "@antelopejs/interface-dms/base/activity-feed";
import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import { Card } from "@antelopejs/interface-dms/base/card";
import { Grid } from "@antelopejs/interface-dms/base/grid";
import {
  KeyValueList,
  type KeyValueListItem,
} from "@antelopejs/interface-dms/base/key-value-list";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { RegisterPage, settingsCategory } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { loadOverviewActivity } from "./overview/account-activity";
import {
  type BlockItems,
  loadAccountSummary,
} from "./overview/account-summary";
import { extractSessionId } from "./users/profile-helpers";

const TEXTS = "$page.settings.overview";
const ACCOUNT_SUMMARY_URL = "/settings/account-summary";
const ACTIVITY_URL = "/settings/activity";
const PROFILE_PATH = "/settings/user/profile";
const ACTIVITY_ROWS = 6;
// Wide enough for a label and its value side by side: below two of them,
// the cards stack.
const SUMMARY_COLUMN_WIDTH = "20rem";

/**
 * The settings overview: the signed-in user's account and latest activity,
 * then a card per settings page they can open.
 */
@RegisterPage()
export class SettingsIndexPage extends settingsCategory {
  static summary = Grid({ minColumnWidth: SUMMARY_COLUMN_WIDTH })
    .child(
      "account",
      Card({
        title: `${TEXTS}.your_account`,
        padded: false,
        actions: [
          {
            label: `${TEXTS}.edit_profile`,
            to: PROFILE_PATH,
            icon: "i-ph-arrow-right",
          },
        ],
      }).child(
        "details",
        KeyValueList({ fetchUrl: ACCOUNT_SUMMARY_URL, card: false }),
      ),
    )
    .child(
      "activity",
      ActivityFeed({
        title: `${TEXTS}.activity.title`,
        fetchUrl: ACTIVITY_URL,
        maxItems: ACTIVITY_ROWS,
        empty: {
          title: `${TEXTS}.activity.empty_title`,
          description: `${TEXTS}.activity.empty_description`,
        },
      }),
    )
    .meta({ name: `${TEXTS}.your_account`, icon: "i-ph-user-circle" });

  @AuthUserWithPermission(SettingsIndexPage)
  declare user: User;

  /** The "Your account" card: who the user is here, how sign-in is kept safe. */
  @Get("account-summary")
  getAccountSummary(
    @Context() context: RequestContext,
  ): Promise<BlockItems<KeyValueListItem>> {
    return loadAccountSummary(this.user, getRequestTenantId(context));
  }

  /** The user's latest account events, newest first. */
  @Get("activity")
  getActivity(
    @Context() context: RequestContext,
    @Parameter("authorization", "header") authorization: string,
  ): Promise<BlockItems<ActivityFeedItem>> {
    return loadOverviewActivity(
      this.user,
      getRequestTenantId(context),
      extractSessionId(authorization),
    );
  }
}
