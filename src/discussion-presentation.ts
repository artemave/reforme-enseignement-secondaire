import type { Item, Unit } from './model.js';

/** Clean only our recognisable giscus-generated header, retaining its hidden lookup hash. */
export function discussionPresentation(item: Item, units: Unit[], revision: string): { title: string; body: string } | null {
  const generated = /^([a-f0-9]{64})\/(u-\d+): ([\s\S]+?)(?: \(\d{4}-\d{2}-\d{2}T[\d:.]+Z\))?$/u.exec(item.title);
  const header = `# ${item.title}\n\n`;
  if (item.kind !== 'discussion' || generated === null || !item.body.startsWith(header) || !item.body.includes('<!-- sha1:')) return null;
  const originalRevision = generated[1];
  const target = originalRevision === revision ? units.find((unit) => unit.id === generated[2]) : undefined;
  const quote = target?.markdown ?? String(generated[3]);
  const plain = quote.replace(/[*_`#]/gu, '').replace(/\s+/gu, ' ').trim().replace(/([.!?])\s[\s\S]*$/u, '$1');
  const title = `Discussion : ${plain.length > 120 ? `${plain.slice(0, 117).trimEnd()}…` : plain}`;
  const rest = item.body.slice(header.length)
    .replace(/^Un document de travail ouvert à la discussion\.[^\n]*\n\n/u, '')
    .replace(/^(https:\/\/[^\s]+)$/mu, '[Lire dans le document]($1)');
  const body = `${quote.split('\n').map((line) => `> ${line}`).join('\n')}\n\n${rest}`;
  return { title, body };
}
