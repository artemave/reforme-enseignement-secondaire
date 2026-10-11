import { expect, it } from 'vitest';
import { passagePath, resolvePassage } from '../src/routes.js';
import { index, unit } from './fixtures.js';
it('uses the document root and revision-specific passage URLs, rejecting expired or incomplete links', () => {
  const paragraph = { ...unit, id: 'u-2', kind: 'paragraph' as const };
  const current = { ...index, units: [unit, paragraph] };
  expect(passagePath(current, unit)).toBe('');
  expect(passagePath(current, paragraph)).toBe('passage/hash/u-2/');
  expect(resolvePassage(current, '/repo/', '/repo/')).toEqual({ redirect: false });
  expect(resolvePassage(current, '/repo/passage/hash/u-2/', '/repo/')).toEqual({ target: paragraph, redirect: false });
  expect(resolvePassage(current, '/repo/passage/old/u-2/', '/repo/').notice).toContain('ancienne version');
  for (const path of ['unknown', 'passage/hash/', 'passage/hash/u-99/', 'passage/hash/u-1/']) expect(resolvePassage(current, `/repo/${path}`, '/repo/')).toEqual({ redirect: true });
});
