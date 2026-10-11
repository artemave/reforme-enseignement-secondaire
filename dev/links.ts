/** Rewrite fixture GitHub and reader URLs before they reach an anchor. */
export function fixtureHref(href: string, repository: string): string {
  const url = new URL(href, 'http://localhost');
  if (url.origin === 'https://github.com' && (url.pathname === `/${repository}` || url.pathname.startsWith(`/${repository}/`))) {
    return `/__dev/github${url.pathname}${url.search}${url.hash}`;
  }
  if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.pathname === '/') return `/${url.search}${url.hash}`;
  return href;
}
