import { describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writePassagePages } from '../src/passage-pages.js';
import { index, unit } from './fixtures.js';
vi.mock('node:fs/promises', () => { const mocked = { mkdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() }; return { ...mocked, default: mocked }; });
describe('static passage publication', () => {
  it('publishes direct pages, incomplete paths and a 404 fallback with assets rooted under the repository', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ ...index, units: [unit, { ...unit, id: 'u-2', kind: 'section' }] })).mockResolvedValueOnce('<html><head></head><body></body></html>');
    await writePassagePages('https://a.github.io/b/');
    expect(writeFile).toHaveBeenCalledWith('dist/comment-ca-marche/index.html', expect.stringContaining('<base href="/b/">'));
    expect(writeFile).toHaveBeenCalledWith('dist/404.html', expect.stringContaining('<base href="/b/">'));
    expect(writeFile).toHaveBeenCalledWith('dist/passage/hash/u-2/index.html', expect.stringContaining('<base href="/b/">'));
    expect(writeFile).toHaveBeenCalledWith('dist/passage/hash/index.html', expect.any(String));
    expect(mkdir).not.toHaveBeenCalledWith('dist/passage/hash/u-1/', expect.anything());
  });
});
