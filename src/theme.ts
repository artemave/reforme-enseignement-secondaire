/** Follow the system until the reader saves an explicit preference. */
export function installTheme(root: Document, browser: Pick<Window, 'localStorage' | 'matchMedia'> = window): void {
  const button = root.querySelector<HTMLButtonElement>('#theme-toggle');
  if (button === null) return;
  let saved: string | null = null;
  try { saved = browser.localStorage.getItem('theme'); } catch { /* Storage can be unavailable in private browsing. */ }
  const preference = browser.matchMedia('(prefers-color-scheme: dark)');
  let explicit = saved === 'dark' || saved === 'light';
  let dark = saved === 'dark' || (saved !== 'light' && preference.matches);
  const apply = (): void => {
    const mode = dark ? 'dark' : 'light';
    root.documentElement.dataset['theme'] = mode;
    root.documentElement.style.colorScheme = mode;
    button.textContent = dark ? '☀' : '☾';
    button.setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode sombre');
    for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe')) {
      frame.contentWindow?.postMessage({ giscus: { setConfig: { theme: mode } } }, new URL(frame.src, root.baseURI).origin);
    }
  };
  apply();
  preference.addEventListener('change', (event) => {
    if (!explicit) { dark = event.matches; apply(); }
  });
  button.onclick = () => {
    explicit = true;
    dark = !dark; apply();
    try { browser.localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* The switch still works without storage. */ }
  };
}
