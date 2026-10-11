import { describe, expect, it, vi } from 'vitest';
import { parseDocument, contributionUrl } from '../src/document.js';
import { originalDescription } from '../src/history.js';
import { request } from '../src/http.js';
import { aiFromEnv, configFromEnv } from '../src/config.js';
import { BOT_MARKER, matchItem } from '../src/matcher.js';
import { unit, item, index, fetchQueue } from './fixtures.js';

describe('document targets', () => {
  it('handles headings, paragraphs, lists, code, definitions and context', () => {
    const units = parseDocument('# Title\n\nIntro [link][x].\n\n## Section\n\nA paragraph.\n\n### Child\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n\n## Next\n\n[x]: https://example.com\n');
    expect(units.map((u) => u.kind)).toEqual(['title', 'paragraph', 'section', 'paragraph', 'section', 'paragraph', 'paragraph', 'section']);
    expect(units[3]?.context).toContain('Title / Section');
    expect(units[7]?.context).not.toContain('Child');
    expect(units[1]?.html).toContain('https://example.com');
    expect(parseDocument('')).toEqual([]);
  });
  it('encodes contribution URLs with quotation, context and revision', () => {
    const issue = new URL(contributionUrl(index, unit, 'issue'));
    expect(issue.pathname).toBe('/a/b/issues/new');
    expect(issue.searchParams.get('body')).toContain('Révision : hash');
    expect(issue.searchParams.get('body')).toContain('# Title');
    expect(issue.searchParams.get('body')).toContain('Context');
    const pr = new URL(contributionUrl({ ...index, branch: 'feature/a' }, unit, 'pr'));
    expect(pr.pathname).toBe('/a/b/compare/feature%2Fa');
    expect(pr.searchParams.get('quick_pull')).toBe('1');
    expect(contributionUrl(index, { ...unit, markdown: '文'.repeat(10_000), context: 'é'.repeat(10_000) }, 'issue').length).toBeLessThan(8000);
    const fullPassage = 'A paragraph with surrounding context. '.repeat(15);
    expect(new URL(contributionUrl(index, { ...unit, markdown: fullPassage }, 'issue')).searchParams.get('body')).toContain(fullPassage);
  });
});
describe('original descriptions', () => {
  const edit = { diff: 'Original', editedAt: '2026-01-01', deletedAt: null };
  it('reads the original creation snapshot from GitHub history, not a patch', () => {
    expect(originalDescription('Current', [{ ...edit, diff: 'Second', editedAt: '2026-01-02' }, edit], true, 'date')).toBe('Original');
    expect(originalDescription('Untouched', [], false, null)).toBe('Untouched');
    expect(originalDescription('Current', [{ ...edit, diff: 'Second' }, edit], true, 'date')).toBe('Original');
  });
  it('does not fabricate unavailable creation data', () => {
    expect(originalDescription('Current', [edit], false, 'date')).toBeNull();
    expect(originalDescription('Current', [], true, 'date')).toBeNull();
    expect(originalDescription('Current', [{ ...edit, deletedAt: 'date' }], true, 'date')).toBeNull();
    expect(originalDescription('Current', [{ ...edit, diff: null }], true, 'date')).toBeNull();
  });
});
describe('HTTP and configuration', () => {
  it('gets and writes JSON and supports empty DELETE responses', async () => {
    const fetcher = fetchQueue({ ok: true });
    expect(await request(fetcher, 'https://api.github.com/test', 'secret')).toEqual({ ok: true });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    const empty = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await request(empty, 'https://api.github.com/test', 'secret', 'DELETE', { a: 1 })).toBeNull();
    expect(empty.mock.calls[0]?.[1]?.body).toBe('{"a":1}');
  });
  it('fails without disclosing response content', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private', { status: 403 }));
    await expect(request(fetcher, 'https://api.github.com/test', 'secret')).rejects.toThrow('Request failed (403): /test');
  });
  it('has defaults and validates configured repository and HTTPS AI endpoint', () => {
    expect(configFromEnv({ SITE_URL: '' }).siteUrl).toBe('https://artemave.github.io/reforme-enseignement-secondaire/');
    expect(configFromEnv({}).siteUrl).toBe('https://artemave.github.io/reforme-enseignement-secondaire/');
    expect(configFromEnv({ GITHUB_REPOSITORY: 'a/b', DOCUMENT_BRANCH: 'trunk', DOCUMENT_PATH: 'd.md', SITE_URL: 'https://example.com/', BOT_LOGIN: 'app[bot]' })).toEqual({ repository: 'a/b', branch: 'trunk', documentPath: 'd.md', siteUrl: 'https://example.com/', botLogin: 'app[bot]' });
    expect(() => configFromEnv({ GITHUB_REPOSITORY: 'no' })).toThrow();
    expect(aiFromEnv({ AI_API_KEY: 'secret' })).toEqual({ token: 'secret', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini' });
    expect(aiFromEnv({ AI_API_KEY: 'secret', AI_ENDPOINT: 'https://example.com/chat', AI_MODEL: 'custom' }).model).toBe('custom');
    expect(() => aiFromEnv({ AI_API_KEY: 'secret', AI_ENDPOINT: 'http://example.com' })).toThrow();
    expect(() => aiFromEnv({})).toThrow();
  });
});
describe('conservative AI matching', () => {
  const ai = { token: 'key', endpoint: 'https://example.com/chat', model: 'model' };
  const decision = { targetId: unit.id, confidence: 0.95, evidence: 'Title', reason: 'Relevant' };
  const response = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
  it('uses current text, original history, PR diff, labels and non-bot discussion', async () => {
    const fetcher = fetchQueue(response(decision));
    const result = await matchItem({ ...item, kind: 'pr', diff: '-old\n+new', labels: ['label'], discussion: ['review'], comments: [{ id: 1, login: 'github-actions[bot]', body: `${BOT_MARKER} own output` }, { id: 2, login: 'reader', body: 'reader' }, { id: 3, login: 'github-actions[bot]', body: 'other automation' }] }, [unit], ai, 'github-actions[bot]', fetcher);
    expect(result).toEqual(decision);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Accept: 'application/json' });
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('X-GitHub-Api-Version');
    const body = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected request body');
    expect(body).toContain('originalDescription');
    expect(body).toContain('other automation'); expect(body).toContain('review'); expect(body).toContain('reader'); expect(body).not.toContain('own output');
  });
  it.each([
    { ...decision, targetId: null }, { ...decision, targetId: 'unknown' },
    { ...decision, confidence: 0.89 }, { ...decision, evidence: '' },
    { ...decision, evidence: '   ' }, { ...decision, evidence: 'invented' },
  ])('rejects uncertain or unsupported match %j', async (value) => {
    expect((await matchItem(item, [unit], ai, 'bot', fetchQueue(response(value)))).targetId).toBeNull();
  });
  it('accepts the threshold exactly', async () => {
    expect((await matchItem(item, [unit], ai, 'bot', fetchQueue(response({ ...decision, confidence: 0.9 })))).targetId).toBe(unit.id);
  });
  it.each([{ choices: [] }, { choices: [{ message: { content: null } }] }])('fails safely on refusal or missing completion', async (value) => {
    await expect(matchItem(item, [unit], ai, 'bot', fetchQueue(value))).rejects.toThrow('AI returned no mapping');
  });
  it('rejects malformed JSON and schema violations', async () => {
    await expect(matchItem(item, [unit], ai, 'bot', fetchQueue({ choices: [{ message: { content: 'oops' } }] }))).rejects.toThrow();
    await expect(matchItem(item, [unit], ai, 'bot', fetchQueue(response({ ...decision, confidence: 2 })))).rejects.toThrow();
  });
  it('can use injected global fetch as the default transport', async () => {
    vi.stubGlobal('fetch', fetchQueue(response(decision)));
    await expect(matchItem(item, [unit], ai, 'bot')).resolves.toEqual(decision);
    vi.unstubAllGlobals();
  });
});
