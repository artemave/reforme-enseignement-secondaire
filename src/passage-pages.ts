import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { indexSchema } from './model.js';
import { passagePath } from './routes.js';

/** Pages serves current targets directly; its custom 404 resolves expired links. */
export async function writePassagePages(siteUrl: string): Promise<void> {
  const index = indexSchema.parse(JSON.parse(await readFile('public/annotations.json', 'utf8')) as unknown);
  const original = await readFile('dist/index.html', 'utf8');
  const base = new URL(siteUrl).pathname;
  const html = original.replace('<head>', `<head><base href="${base}">`);
  await writeFile('dist/index.html', html);
  await writeFile('dist/404.html', html);
  await mkdir('dist/comment-ca-marche', { recursive: true });
  await writeFile('dist/comment-ca-marche/index.html', html);
  const incomplete = `dist/passage/${encodeURIComponent(index.revision)}`;
  await mkdir(incomplete, { recursive: true });
  await writeFile(`${incomplete}/index.html`, html);
  for (const unit of index.units.filter((entry) => entry.kind !== 'title')) {
    const directory = `dist/${passagePath(index, unit)}`;
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}index.html`, html);
  }
}
