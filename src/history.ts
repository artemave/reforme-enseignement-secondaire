import type { Edit } from './model.js';

/** GitHub's `diff` field contains historical body snapshots, despite its name.
 * Only call a snapshot the original when GitHub confirms creation data exists.
 */
export function originalDescription(current: string, edits: Edit[], includesCreatedEdit: boolean, lastEditedAt: string | null): string | null {
  if (lastEditedAt === null) return current;
  if (!includesCreatedEdit) return null;
  // Preserve oldest-first API order when multiple edits share a timestamp.
  const first = [...edits].reverse().sort((a, b) => a.editedAt.localeCompare(b.editedAt))[0];
  if (first?.deletedAt !== null) return null;
  return first.diff;
}
