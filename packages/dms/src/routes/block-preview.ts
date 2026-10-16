import { Controller, Get } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import {
  listPreviewBlockTypes,
  type PreviewBlockTypes,
} from "../pages/public/preview/block-types";

/**
 * The block types `DmsBlockPreview` may draw, for a dashboard component that
 * renders it without the allowlist `/dms-preview` hands it (a chat preview).
 * Signed-in members only: the list names every module's own blocks.
 */
export class BlockPreviewController extends Controller("/api/block-preview") {
  @AuthTenantMember()
  declare user: User;

  @Get("/types")
  getBlockTypes(): PreviewBlockTypes {
    return listPreviewBlockTypes();
  }
}
