import type { AnnotationIndex, Unit } from './model.js';

export function passagePath(index: Pick<AnnotationIndex, 'revision'>, unit: Unit): string {
  return unit.kind === 'title' ? '' : `passage/${encodeURIComponent(index.revision)}/${unit.id}/`;
}
export function resolvePassage(index: AnnotationIndex, pathname: string, base: string): { target?: Unit; notice?: string; redirect: boolean } {
  const path = pathname.slice(base.length);
  if (path === '') return { redirect: false };
  const route = /^passage\/([^/]+)(?:\/(u-\d+))?\/?$/u.exec(path);
  if (route === null) return { redirect: true };
  if (route[1] !== encodeURIComponent(index.revision)) return { redirect: true, notice: 'Ce lien renvoie à une ancienne version du document.' };
  const target = index.units.find((unit) => unit.id === route[2]);
  if (target === undefined || target.kind === 'title') return { redirect: true };
  return { target, redirect: false };
}
