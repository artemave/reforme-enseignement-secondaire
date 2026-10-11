import { describe, expect, it, vi } from 'vitest';
import { synchronise } from '../src/synchronise.js';
import { BOT_MARKER } from '../src/matcher.js';
import { unit, item, config, now } from './fixtures.js';
import type { Item } from '../src/model.js';
function api(items: Item[]) {
  return { state: vi.fn().mockResolvedValue(items), writeComment: vi.fn().mockResolvedValue(undefined), deleteComment: vi.fn().mockResolvedValue(undefined) };
}
const matched = { targetId: unit.id, confidence: 1, evidence: 'Title', reason: 'match' };
describe('synchronisation', () => {
  it('groups exact targets only, sorts output, never claims resolution', async () => {
    const github = api([{ ...item, number: 3, kind: 'pr' }, item, { ...item, number: 2 }, { ...item, number: 4 }]);
    const match = vi.fn().mockResolvedValueOnce(matched).mockResolvedValueOnce(matched).mockResolvedValueOnce({ ...matched, targetId: 'u-2' }).mockResolvedValueOnce({ ...matched, targetId: 'unknown' });
    const result = await synchronise(github, [unit, { ...unit, id: 'u-2' }], config, match, now);
    expect(result.annotations.map((a) => a.number)).toEqual([1, 2, 3]);
    expect(github.writeComment.mock.calls[0]?.[1]).toContain('Issue #1');
    expect(github.writeComment.mock.calls[1]?.[1]).toContain('PR #3');
    expect(github.writeComment.mock.calls[0]?.[1]).not.toContain('Issue #2');
    expect(github.writeComment.mock.calls[2]?.[1]).toContain('No other open items');
    expect(github.writeComment.mock.calls[3]?.[1]).toContain('No confident match');
    expect(github.writeComment.mock.calls[0]?.[1]).toContain('does not imply resolution');
  });
  it('updates changed bot comments, removes duplicates, preserves human spoofed markers and leaves unchanged comments alone', async () => {
    const github = api([item]);
    await synchronise(github, [unit], config, () => Promise.resolve(matched), now);
    const body: unknown = github.writeComment.mock.calls[0]?.[1];
    if (typeof body !== 'string') throw new Error('Expected comment');
    const second = api([{ ...item, comments: [
      { id: 1, body, login: config.botLogin },
      { id: 2, body: BOT_MARKER, login: config.botLogin },
      { id: 3, body: BOT_MARKER, login: 'reader' },
      { id: 4, body: 'other bot comment', login: config.botLogin },
    ] }]);
    await synchronise(second, [unit], config, () => Promise.resolve(matched), now);
    expect(second.writeComment).not.toHaveBeenCalled();
    expect(second.deleteComment).toHaveBeenCalledExactlyOnceWith(2);
    const third = api([{ ...item, comments: [{ id: 1, body: 'old', login: config.botLogin }, { id: 5, body: BOT_MARKER, login: config.botLogin }] }]);
    await synchronise(third, [unit], config, () => Promise.resolve(matched), now);
    expect(third.writeComment).toHaveBeenCalledWith(1, body, 5, 'issue');
  });
  it('clears closed and unmatched mappings, skips closed items without a bot comment', async () => {
    const github = api([{ ...item, open: false, comments: [{ id: 1, body: BOT_MARKER, login: config.botLogin }] }, { ...item, number: 2, open: false }, { ...item, number: 3 }]);
    const match = vi.fn().mockResolvedValue({ ...matched, targetId: null });
    const result = await synchronise(github, [unit], config, match, now);
    expect(result.annotations).toEqual([]); expect(match).toHaveBeenCalledTimes(1);
    expect(github.writeComment).toHaveBeenCalledTimes(2);
  });
  it('distinguishes a Discussion and PR with the same number and uses revision-specific cross-references', async () => {
    const paragraph = { ...unit, kind: 'paragraph' as const };
    const github = { ...api([{ ...item, kind: 'discussion' }, { ...item, kind: 'pr' }]), giscus: { repositoryId: 'repo', categoryId: 'cat', category: 'General', categorySlug: 'general', clientUrl: 'https://giscus.app/client.js' } };
    const result = await synchronise(github, [paragraph], config, () => Promise.resolve(matched), now);
    expect(result.annotations.map((entry) => entry.kind)).toEqual(['discussion', 'pr']);
    expect(github.writeComment.mock.calls[0]?.[1]).toContain('PR #1');
    expect(github.writeComment.mock.calls[1]?.[1]).toContain('Discussion #1');
    expect(github.writeComment.mock.calls[0]?.[1]).toContain('/passage/hash/u-1/');
    expect(result.giscus?.repositoryId).toBe('repo');
  });
  it('does not mutate if any mapping fails', async () => {
    const github = api([item, { ...item, number: 2 }]);
    const match = vi.fn().mockResolvedValueOnce(matched).mockRejectedValueOnce(new Error('AI failed'));
    await expect(synchronise(github, [unit], config, match, now)).rejects.toThrow('AI failed');
    expect(github.writeComment).not.toHaveBeenCalled();
  });
});
