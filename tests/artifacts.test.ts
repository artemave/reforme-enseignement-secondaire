import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { prepare, revisionOf, writeIndex } from '../src/artifacts.js';
import { config, index, now } from './fixtures.js';
vi.mock('node:fs/promises', () => {
  const mocked = { readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() };
  return { ...mocked, default: mocked };
});
beforeEach(() => { vi.resetAllMocks(); });
describe('publication artifacts', () => {
  it('hashes snapshots and writes validated JSON', async () => {
    expect(revisionOf('a')).toHaveLength(64);
    expect(revisionOf('a')).not.toBe(revisionOf('b'));
    await writeIndex(index);
    expect(mkdir).toHaveBeenCalledWith('public', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('public/annotations.json', expect.stringContaining('"version": 1'));
  });
  it('creates an empty local index only when no index exists', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('# Title').mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await prepare(config, now);
    expect(writeFile).toHaveBeenCalledWith('public/annotations.json', expect.stringContaining('"annotations": []'));
  });
  it('preserves synced annotations for the exact document and configuration', async () => {
    const fresh = { ...index, revision: revisionOf('# Title') };
    vi.mocked(readFile).mockResolvedValueOnce('# Title').mockResolvedValueOnce(JSON.stringify(fresh));
    await prepare(config, now);
    expect(writeFile).toHaveBeenCalledWith('public/annotations.json', `${JSON.stringify(fresh, null, 2)}\n`);
  });
  it.each([{ revision: 'stale' }, { repository: 'c/d' }, { branch: 'other' }, { documentPath: 'other.md' }])('refuses stale publication %j', async (change) => {
    vi.mocked(readFile).mockResolvedValueOnce('# Title').mockResolvedValueOnce(JSON.stringify({ ...index, revision: revisionOf('# Title'), ...change }));
    await expect(prepare(config, now)).rejects.toThrow('Annotation index is stale');
  });
  it.each([new Error('read failure'), Object.assign(new Error('denied'), { code: 'EACCES' }), 'unknown failure'])('does not hide artifact failures %s', async (error) => {
    vi.mocked(readFile).mockResolvedValueOnce('# Title').mockRejectedValueOnce(error);
    await expect(prepare(config, now)).rejects.toBe(error);
  });
  it('does not hide malformed artifacts', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('# Title').mockResolvedValueOnce('{}');
    await expect(prepare(config, now)).rejects.toThrow();
  });
});
