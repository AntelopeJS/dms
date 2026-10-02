import { Category } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "../sections";

export const pageCategory = Category("form", {
  displayName: "Form",
  icon: "i-ph-note-pencil",
  order: 40,
  category: libraryCategory,
});
