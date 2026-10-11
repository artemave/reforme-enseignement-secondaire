export type Fetch = typeof fetch;

export async function request(fetcher: Fetch, url: string, token: string, method = 'GET', body?: unknown): Promise<unknown> {
  const address = new URL(url);
  const github = address.hostname === 'api.github.com';
  const response = await fetcher(url, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: github ? 'application/vnd.github+json' : 'application/json', 'Content-Type': 'application/json', ...(github ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000),
  });
  // Do not log response bodies: GitHub state and credentials can be sensitive.
  if (!response.ok) throw new Error(`Request failed (${String(response.status)}): ${address.pathname}`);
  if (response.status === 204) return null;
  return response.json() as Promise<unknown>;
}
