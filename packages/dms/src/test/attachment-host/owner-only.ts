import { Card } from "@antelopejs/interface-dms/base";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";

@RegisterPage()
export class OwnerOnlyPage extends RootPageController("owner-only-tools", {
  displayName: "Owner tools",
  hidden: true,
  ownerOnly: true,
}) {
  static notes = Card({ title: "Owner notes" });
}
