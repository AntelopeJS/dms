import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ActivityFeed,
  CodeBlock,
  KeyValueList,
} from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { systemSection } from "../sections";
import { HOOKS_API } from "./api";
import { BLOCKED_INVITE_DOMAIN } from "./hooks";
import { HOOKS_TOPIC } from "./log";
import {
  WEBHOOK_SECRET,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOKS_API,
} from "./webhooks";

const INVITES_PAGE_URL = "/settings/workspace/invites";
const FRONTEND_URL = "http://localhost:3001";
const FEED_VISIBLE_ITEMS = 10;

const WEBHOOK_SAMPLE = `# Declared in publicEndpoints: no session, no Origin, the header is relayed
curl -X POST ${FRONTEND_URL}${WEBHOOKS_API}/demo \\
  -H "${WEBHOOK_SIGNATURE_HEADER}: ${WEBHOOK_SECRET}"`;

@RegisterPage()
export class HooksPage extends PageController(
  "hooks",
  {
    displayName: "Hooks & invites",
    icon: "i-ph-plugs-connected",
    category: systemSection,
    order: 30,
    description:
      "Demonstrates: RegisterHook, RegisterInviteExtension, RegisterInviteAvailability and publicEndpoints. Invite someone in Settings › Invitations and watch the feed.",
  },
  DefaultLayout({
    headerActions: [
      {
        id: "invite",
        label: "Open Invitations",
        icon: "i-ph-envelope-simple",
        color: "primary",
        target: { type: "page", url: INVITES_PAGE_URL },
      },
      {
        id: "seats",
        label: "Toggle “no seat left”",
        icon: "i-ph-users-three",
        target: {
          type: "api",
          method: "POST",
          url: `${HOOKS_API}/seats/toggle`,
          successMessage: "Seats toggled",
        },
      },
    ],
  }),
) {
  static feed = ActivityFeed({
    title: "Hooks fired since the backend started",
    fetchUrl: `${HOOKS_API}/log`,
    realtimeTopic: HOOKS_TOPIC,
    visibleItems: FEED_VISIBLE_ITEMS,
    empty: { title: "Nothing yet: invite someone in Settings › Invitations" },
  });

  static seats = KeyValueList({
    title: "Invite availability",
    fetchUrl: `${HOOKS_API}/seats`,
  });

  static tryIt = KeyValueList({
    title: "What to try",
    items: [
      {
        label: "Invite anyone",
        value: "invite:being-created, invite:created",
        detail:
          "The invite modal also shows a Team field, merged after the email by RegisterInviteExtension.",
      },
      {
        label: `Invite someone${BLOCKED_INVITE_DOMAIN}`,
        value: "Vetoed",
        detail:
          "The invite:being-created handler throws, so the invitation is refused.",
      },
      {
        label: "Cancel or resend an invitation",
        value: "invite:deleted, onCleanup",
        detail: "Editing its Team calls the extension's onUpdate.",
      },
      {
        label: "Toggle “no seat left”",
        value: "RegisterInviteAvailability",
        detail:
          "The Invite button of Members and Invitations is disabled with a reason.",
      },
    ],
  });

  static webhook = CodeBlock({
    title: "Call the public webhook (publicEndpoints)",
    language: "shell",
    code: WEBHOOK_SAMPLE,
  });
}
