import { vi } from 'vitest';
import type { AnnotationIndex, Item, Unit } from '../src/model.js';
import type { SyncConfig } from '../src/synchronise.js';
export const unit: Unit = { id: 'u-1', kind: 'title', markdown: '# Title', html: '<h1>Title</h1>', label: 'Title', context: '# Title\n\nContext' };
export const item: Item = { number: 1, kind: 'issue', title: 'Discuss', body: 'Description', url: 'https://github.com/a/b/issues/1', open: true, labels: [], comments: [], discussion: [], edits: [], includesCreatedEdit: false, lastEditedAt: null, diff: '' };
export const config: SyncConfig = { repository: 'a/b', branch: 'main', documentPath: 'content/document.md', revision: 'hash', siteUrl: 'https://a.github.io/b/', botLogin: 'github-actions[bot]' };
export const now = '2026-10-10T00:00:00.000Z';
export const index: AnnotationIndex = { version: 1, repository: config.repository, branch: config.branch, documentPath: config.documentPath, revision: config.revision, generatedAt: now, units: [unit], annotations: [] };
export function fetchQueue(...values: unknown[]) {
  return vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(values.shift()), { status: 200 })));
}
