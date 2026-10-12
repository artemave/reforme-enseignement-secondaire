/** Choose native page-transition direction from the actual navigation endpoints. */
interface NavigationEndpoints { from: { url: string | null } | null; entry: { url: string | null } | null }

export function installPageTransitions(root: Document = document): void {
  const browser = root.defaultView;
  if (browser === null) return;
  const apply = (transition: ViewTransition | null, activation: NavigationEndpoints | null | undefined): void => {
    if (transition === null || activation === null || activation === undefined) return;
    const from = activation.from?.url;
    const to = activation.entry?.url;
    if (typeof from !== 'string' || typeof to !== 'string') return;
    const previous = new URL(from);
    const next = new URL(to);
    const base = new URL('.', root.baseURI);
    if (previous.origin !== base.origin || next.origin !== base.origin) return;
    const types = transition.types;
    if (previous.pathname === base.pathname && next.pathname.startsWith(`${base.pathname}passage/`)) types.add('discussion');
    else if (previous.pathname.startsWith(`${base.pathname}passage/`) && next.pathname === base.pathname) types.add('document');
  };
  browser.addEventListener('pageswap', (event) => { apply(event.viewTransition, event.activation); });
  browser.addEventListener('pagereveal', (event) => {
    // Navigation is newer than the Window interface in our TypeScript DOM library.
    const navigation = (browser as Window & { navigation?: { activation: NavigationActivation | null } }).navigation;
    apply(event.viewTransition, navigation?.activation);
  });
}
