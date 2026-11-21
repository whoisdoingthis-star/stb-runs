// Stan walking the street along the top of a run (decision 0052): he stays put and the street slides past as stops are
// ticked; each tick he tosses a paper. Purely for show: nothing depends on it, and it never moves unless a stop is ticked.
// Stan and his satchel are our own drawing.

export const STREET_PX = 1400;      // how far the street slides over a whole run
const KEY = 'stb-walk';
export const walkOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setWalk = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };
/** Where the street sits for this much of the run done: 0 at the start, -STREET_PX at the end. */
export const walkOffset = (done, total) => (total > 0 ? -Math.round(Math.min(1, Math.max(0, done / total)) * STREET_PX) || 0 : 0);

const SATCHEL = '<svg class="sw-bag" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 1 L11 7" stroke="#7a4a1e" stroke-width="1.6" fill="none"/><rect x="5" y="6" width="10" height="9" rx="2" fill="#b0692b" stroke="#7a4a1e" stroke-width="1"/><rect x="7" y="3.5" width="6" height="4" rx="1" fill="#f4f1ea" stroke="#8a8478" stroke-width=".8"/></svg>';
const PAPER = '<svg viewBox="0 0 14 9" width="14" height="9" aria-hidden="true"><rect x=".5" y=".5" width="13" height="8" rx="1.5" fill="#f4f1ea" stroke="#8a8478"/><path d="M3 3.2h8M3 5.6h5" stroke="#8a8478" stroke-width="1"/></svg>';

/** stanNode: a small drawing of Stan (from js/stan.js). Returns { el, set(done, total), toss() }. */
export function createStanWalk(stanNode) {
  const el = document.createElement('div'); el.className = 'stan-walk'; el.setAttribute('aria-hidden', 'true');
  const street = document.createElement('div'); street.className = 'sw-street';
  const me = document.createElement('div'); me.className = 'sw-stan'; me.append(stanNode); me.insertAdjacentHTML('beforeend', SATCHEL);
  el.append(street, me);
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  let last = null;
  return {
    el,
    set(done, total) { const x = walkOffset(done, total); if (x !== last) { last = x; street.style.backgroundPositionX = `${x}px`; } el.classList.toggle('all-done', total > 0 && done >= total); },
    toss() {
      if (calm()) return;
      me.classList.remove('step'); void me.offsetWidth; me.classList.add('step');
      const p = document.createElement('span'); p.className = 'sw-paper'; p.innerHTML = PAPER; el.append(p);
      const gone = () => p.remove(); p.addEventListener('animationend', gone); setTimeout(gone, 1200);
    },
  };
}
