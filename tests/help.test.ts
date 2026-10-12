import { expect, it } from 'vitest';
import { renderHelp } from '../src/help.js';
import { index } from './fixtures.js';

it('requires a main element to display the help page', () => {
  const root = document.implementation.createHTMLDocument();
  expect(() => { renderHelp(index, root); }).toThrow('Missing main element');
});
