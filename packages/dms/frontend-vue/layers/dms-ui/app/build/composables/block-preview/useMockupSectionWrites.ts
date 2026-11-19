import { ref, type ComputedRef, type Ref } from "vue";
import type { MockupEdit } from "../../utils/mockupEdit";
import {
  sectionCoalesceKey,
  specSections,
  type MockupSectionEdit,
} from "../../utils/mockupSections";
import type { MockupSpecDocument } from "../../utils/mockupSpec";

/** A section to delete that still holds pages, waiting for the developer to confirm. */
export interface SectionRemoval {
  category: string;
  title: string;
  /** How many pages move to the default section. */
  count: number;
}

interface SectionWritesOptions {
  spec: ComputedRef<MockupSpecDocument | undefined>;
  /** Whether the spec shown may be edited now. */
  canEdit: ComputedRef<boolean>;
  edit: (edit: MockupEdit, coalesceKey?: string) => void;
}

export interface MockupSectionWrites {
  removing: Ref<SectionRemoval | undefined>;
  /** Writes a change of the sections, or asks first when it deletes a section holding pages. */
  write: (edit: MockupSectionEdit) => void;
  /** Deletes the section waiting for confirmation. */
  confirm: () => void;
  cancel: () => void;
}

/**
 * Writes the changes of the sidebar's sections, from the viewer's page list
 * or the preview's sidebar, as any edit of the spec: one undoable step, the
 * keystrokes of a section's icon joined into one. Deleting a section that
 * holds pages waits for the developer to confirm it.
 */
export function useMockupSectionWrites(
  options: SectionWritesOptions,
): MockupSectionWrites {
  const removing = ref<SectionRemoval>();

  function write(edit: MockupSectionEdit): void {
    const spec = options.spec.value;
    if (!options.canEdit.value || !spec) return;
    if (edit.kind === "removeCategory") {
      const section = specSections(spec).find(
        (entry) => entry.category?.id === edit.category,
      );
      if (section?.category && section.pages.length > 0) {
        removing.value = {
          category: section.category.id,
          title: section.category.title,
          count: section.pages.length,
        };
        return;
      }
    }
    options.edit(edit, sectionCoalesceKey(edit));
  }

  function confirm(): void {
    const section = removing.value;
    removing.value = undefined;
    if (section) {
      options.edit({ kind: "removeCategory", category: section.category });
    }
  }

  return {
    removing,
    write,
    confirm,
    cancel: () => {
      removing.value = undefined;
    },
  };
}
