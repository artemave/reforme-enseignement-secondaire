import { z } from 'zod';
import { parseDocument, contributionUrl } from '../src/document.js';
import type { Item, Unit } from '../src/model.js';

export const fixtureRepository = 'development/document-annotations';
export const fixtureTime = '2026-10-10T12:00:00.000Z';
export interface FixtureItem extends Item { merged: boolean }

export function passageBody(unit: Unit): string {
  const url = contributionUrl({ repository: fixtureRepository, branch: 'main', documentPath: 'content/document.md', revision: 'fixture' }, unit);
  return z.string().parse(new URL(url).searchParams.get('body'));
}

/** Bind examples to content, not ordinal IDs that can shift on document edits. */
export function seedItems(markdown: string): FixtureItem[] {
  const units = parseDocument(markdown);
  const paragraphs = units.filter((unit) => unit.kind === 'paragraph');
  const title = units.find((unit) => unit.kind === 'title');
  const section = units.find((unit) => unit.kind === 'section');
  const learning = paragraphs[1];
  const support = paragraphs[3];
  const make = (number: number, name: string, unit?: Unit): FixtureItem => ({
    number, kind: 'discussion', title: name, body: unit === undefined ? 'Une question sans rapport précis avec le texte.' : passageBody(unit),
    url: `https://github.com/${fixtureRepository}/discussions/${String(number)}`,
    open: true, merged: false, labels: ['discussion'],
    comments: [], discussion: [], edits: [], includesCreatedEdit: false, lastEditedAt: null, diff: '',
  });
  const historical = make(5, 'Quels moyens pour l’accompagnement ?', support);
  historical.edits = [{ diff: historical.body, editedAt: fixtureTime, deletedAt: null }];
  historical.includesCreatedEdit = true;
  historical.lastEditedAt = fixtureTime;
  historical.body = 'Question reformulée : quels moyens seront disponibles dans les établissements ?';
  return [
    make(1, 'Clarifier le périmètre de la réforme', title),
    make(2, 'Comment relier les matières dans les programmes ?', section),
    { ...make(3, 'Comment préserver la curiosité des élèves ?', learning), comments: [{ id: 31, login: 'camille', body: 'Des projets concrets pourraient aider à illustrer cette ambition.' }] },
    make(4, 'Comment développer le jugement des élèves ?', learning), historical,
    make(6, 'Question générale sur le calendrier'),
    { ...make(7, 'Ancienne discussion sur les objectifs', learning), open: false },
    { ...make(8, 'Ancienne discussion sur l’accompagnement', support), open: false },
  ];
}
