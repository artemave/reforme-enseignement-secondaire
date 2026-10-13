// Temporary diagnostics for iOS back-navigation scroll loss.
// Visit any page with ?debug-scroll to enable, ?debug-scroll=off to disable.
(() => {
  const flag = new URL(location.href).searchParams.get('debug-scroll');
  try {
    if (flag === 'off') localStorage.removeItem('debug-scroll');
    else if (flag !== null) localStorage.setItem('debug-scroll', '1');
    if (localStorage.getItem('debug-scroll') === null) return;
  } catch { return; }

  const key = 'debug-scroll-log';
  const start = performance.now();
  let lines = [];
  try { lines = JSON.parse(sessionStorage.getItem(key) ?? '[]'); } catch { /* fresh log */ }
  let panel = null;
  const height = () => document.documentElement.scrollHeight;
  const log = (text) => {
    const page = location.pathname.includes('/passage/') ? 'P' : 'R';
    lines.push(`${page} ${String(Math.round(performance.now() - start)).padStart(5)} ${text}`);
    lines = lines.slice(-60);
    try { sessionStorage.setItem(key, JSON.stringify(lines)); } catch { /* overlay still shows */ }
    if (panel !== null) { panel.textContent = lines.join('\n'); panel.scrollTop = panel.scrollHeight; }
  };

  const watch = (label) => {
    let last = scrollY;
    const until = performance.now() + 3000;
    const tick = () => {
      if (scrollY !== last) { log(`${label} y ${last}→${scrollY} h=${height()}`); last = scrollY; }
      if (performance.now() < until) requestAnimationFrame(tick);
      else log(`${label} settled y=${scrollY} h=${height()}`);
    };
    requestAnimationFrame(tick);
  };

  const navigation = performance.getEntriesByType('navigation')[0];
  log(`start nav=${navigation?.type} restoration=${history.scrollRestoration} y=${scrollY} len=${history.length} state=${JSON.stringify(history.state)}`);
  log(`url=${location.pathname.slice(-30)}${location.hash} ref=${document.referrer.slice(-30)}`);
  watch('boot');

  addEventListener('DOMContentLoaded', () => {
    panel = document.createElement('pre');
    panel.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;max-height:40vh;overflow:auto;margin:0;padding:6px;z-index:2147483647;background:rgba(0,0,0,.82);color:#7f7;font:10px/1.3 ui-monospace,monospace;white-space:pre-wrap;border-radius:6px';
    panel.title = 'Double-tap to clear';
    panel.addEventListener('dblclick', () => { lines = []; log('cleared'); });
    document.body.append(panel);
    log(`DOMContentLoaded y=${scrollY} h=${height()}`);
  });
  addEventListener('load', () => { log(`load y=${scrollY} h=${height()}`); });
  addEventListener('pageshow', (event) => {
    log(`pageshow persisted=${event.persisted} y=${scrollY} h=${height()} restoration=${history.scrollRestoration}`);
    if (event.persisted) watch('bfcache');
  });
  addEventListener('pagehide', (event) => { log(`pagehide persisted=${event.persisted} y=${scrollY}`); });
  addEventListener('popstate', () => { log(`popstate y=${scrollY}`); });
  addEventListener('hashchange', () => { log(`hashchange ${location.hash} y=${scrollY}`); });
  addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (link !== null) log(`click ${link.matches('[data-document-back]') ? 'back-link' : 'link'} ${link.getAttribute('href')?.slice(-30)} y=${scrollY}`);
  }, true);
})();
