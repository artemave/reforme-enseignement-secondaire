import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { build } from 'vite';
import { prepare, writeIndex } from '../src/artifacts.js';
import { matchItem } from '../src/matcher.js';
import { synchronise } from '../src/synchronise.js';
import { load } from '../src/ui.js';
import { index } from './fixtures.js';
vi.mock('node:fs/promises', () => {
  const mocked = { readFile: vi.fn().mockResolvedValue('# Title') };
  return { ...mocked, default: mocked };
});
vi.mock('vite', () => ({ build: vi.fn() }));
vi.mock('../src/artifacts.js', () => ({ prepare: vi.fn(), writeIndex: vi.fn(), revisionOf: vi.fn().mockReturnValue('hash') }));
vi.mock('../src/github.js', () => ({ GitHub: vi.fn() }));
vi.mock('../src/matcher.js', () => ({ matchItem: vi.fn() }));
vi.mock('../src/synchronise.js', () => ({ synchronise: vi.fn().mockImplementation(async (_github: unknown, _units: unknown, _config: unknown, match: (item: unknown, units: unknown) => Promise<unknown>) => { await match({}, []); return index; }) }));
vi.mock('../src/ui.js', () => ({ load: vi.fn() }));
describe('command and browser entrypoints', () => {
  it('prepares and builds the site', async () => {
    await import('../scripts/build.js');
    expect(prepare).toHaveBeenCalledOnce(); expect(build).toHaveBeenCalledOnce();
  });
  it('synchronises the current file and writes its index', async () => {
    vi.stubEnv('AI_API_KEY', 'test'); vi.stubEnv('GITHUB_TOKEN', 'test');
    await import('../scripts/sync.js');
    expect(readFile).toHaveBeenCalledWith('content/document.md', 'utf8');
    expect(synchronise).toHaveBeenCalledOnce(); expect(matchItem).toHaveBeenCalledOnce();
    expect(writeIndex).toHaveBeenCalledWith(index);
    vi.unstubAllEnvs();
  });
  it('loads the browser entrypoint', async () => {
    await import('../src/main.js');
    expect(load).toHaveBeenCalledWith(document);
  });
});
