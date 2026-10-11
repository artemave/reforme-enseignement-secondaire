import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseDocument } from './document.js';
import { indexSchema } from './model.js';
import type { AnnotationIndex } from './model.js';
import type { SyncConfig } from './synchronise.js';

export function revisionOf(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex');
}
export async function writeIndex(index: AnnotationIndex): Promise<void> {
  await mkdir('public', { recursive: true });
  await writeFile('public/annotations.json', `${JSON.stringify(indexSchema.parse(index), null, 2)}\n`);
}
export async function prepare(config: Omit<SyncConfig, 'revision'>, now: string): Promise<void> {
  const markdown = await readFile(config.documentPath, 'utf8');
  const revision = revisionOf(markdown);
  let index: AnnotationIndex;
  try {
    index = indexSchema.parse(JSON.parse(await readFile('public/annotations.json', 'utf8')) as unknown);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    index = { version: 1, repository: config.repository, branch: config.branch, documentPath: config.documentPath, revision, generatedAt: now, units: parseDocument(markdown), annotations: [] };
  }
  if (index.revision !== revision || index.repository !== config.repository || index.branch !== config.branch || index.documentPath !== config.documentPath) throw new Error('Annotation index is stale. Run synchronisation before publishing.');
  await writeIndex(index);
}
