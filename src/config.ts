import { z } from 'zod';
const environment = z.object({
  GITHUB_REPOSITORY: z.string().regex(/^[\w.-]+\/[\w.-]+$/u).default('artemave/reforme-enseignement-secondaire'),
  DOCUMENT_BRANCH: z.string().min(1).default('main'),
  DOCUMENT_PATH: z.string().min(1).default('content/document.md'),
  SITE_URL: z.preprocess((value) => value === '' ? undefined : value, z.url().optional()),
  BOT_LOGIN: z.string().min(1).default('github-actions[bot]'),
});
export function configFromEnv(env: NodeJS.ProcessEnv) {
  const parsed = environment.parse(env);
  const [owner, repo] = parsed.GITHUB_REPOSITORY.split('/');
  return { repository: parsed.GITHUB_REPOSITORY, branch: parsed.DOCUMENT_BRANCH,
    documentPath: parsed.DOCUMENT_PATH, botLogin: parsed.BOT_LOGIN,
    siteUrl: parsed.SITE_URL ?? `https://${String(owner)}.github.io/${String(repo)}/` };
}
export function aiFromEnv(env: NodeJS.ProcessEnv) {
  return z.object({ token: z.string().min(1), endpoint: z.url().refine((value) => value.startsWith('https://'), 'AI endpoint must use HTTPS'), model: z.string().min(1) }).parse({ token: env['AI_API_KEY'], endpoint: env['AI_ENDPOINT'] ?? 'https://api.openai.com/v1/chat/completions', model: env['AI_MODEL'] ?? 'gpt-4.1-mini' });
}
