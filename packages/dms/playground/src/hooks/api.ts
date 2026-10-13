import {
  Context,
  Controller,
  Get,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type {
  ActivityFeedResponse,
  KeyValueListItem,
} from "@antelopejs/interface-dms/base";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { areSeatsFull, toggleSeatsFull } from "./invite-extension";
import { hookEvents, recordHookEvent } from "./log";

export const HOOKS_API = "/api/playground/hooks";

interface ItemsResponse {
  items: KeyValueListItem[];
}

interface SeatsToggleResult {
  full: boolean;
}

export class PlaygroundHooksController extends Controller(HOOKS_API) {
  @Get("log")
  log(@AuthUser() _user: User): ActivityFeedResponse {
    const items = hookEvents();
    return { items, count: items.length };
  }

  @Get("seats")
  seats(
    @Context() ctx: RequestContext,
    @AuthUser() _user: User,
  ): ItemsResponse {
    const full = areSeatsFull(getRequestTenantId(ctx));
    return {
      items: [
        {
          label: "RegisterInviteAvailability",
          value: full ? "Invite disabled: no seat left" : "Invite enabled",
          type: "status",
          tone: full ? "warning" : "success",
        },
      ],
    };
  }

  @Post("seats/toggle")
  toggleSeats(
    @Context() ctx: RequestContext,
    @AuthUser() _user: User,
  ): SeatsToggleResult {
    const full = toggleSeatsFull(getRequestTenantId(ctx));
    recordHookEvent({
      icon: "i-ph-users-three",
      title: "Seats toggled",
      detail: full ? "No seat left: invite disabled" : "Seats available again",
    });
    return { full };
  }
}
