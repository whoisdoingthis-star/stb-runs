// Stan: STB's little robot (original design, logo colours). docs/decisions/0021-stan.md
// He is the face of help and good news, never something you need in order to understand a screen:
// he always comes with words, keeps still for "reduce motion", and Settings -> Stan turns him off.
//
//   stan({ pose, size, head, label })  an element; pose = idle | talk | wave | hop | point
//   stanState(el, state)               mouth lights: route (blue) | point (amber) | wait (grey)
//   stanOn()                           the family's Settings switch (on unless turned off)

const Y = '#fdb704'; const INK = '#111'; const METAL = '#7a828e'; const DARK = '#5b636f'; const VISOR = '#0e0f11';

const HEAD = `
  <line x1="100" y1="44" x2="100" y2="18" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><line x1="100" y1="44" x2="100" y2="18" stroke="${METAL}" stroke-width="3" stroke-linecap="round"/>
  <g class="st-pin"><path d="M100 22C91 11 88 5 88 0A12 12 0 1 1 112 0C112 5 109 11 100 22Z" fill="${Y}" stroke="${INK}" stroke-width="4"/><circle cx="100" cy="0" r="4.5" fill="${INK}"/></g>
  <rect x="26" y="40" width="148" height="100" rx="36" fill="${Y}" stroke="${INK}" stroke-width="6"/>
  <rect x="44" y="56" width="112" height="68" rx="22" fill="${VISOR}"/>
  <g class="st-eyes"><rect x="68" y="70" width="20" height="26" rx="10" fill="#fff"/><rect x="112" y="70" width="20" height="26" rx="10" fill="#fff"/>
    <circle cx="82" cy="78" r="3.5" fill="${VISOR}"/><circle cx="126" cy="78" r="3.5" fill="${VISOR}"/></g>
  <g class="st-mouth">${[0, 1, 2, 3, 4].map((i) => `<rect x="${83 + i * 7}" y="106" width="5" height="5" rx="2"/>`).join('')}</g>
  <circle cx="56" cy="104" r="5" fill="#f59e0b" opacity=".55"/><circle cx="144" cy="104" r="5" fill="#f59e0b" opacity=".55"/>`;

const ARM = (side) => {
  const [x1, x2] = side === 'L' ? [44, 18] : [156, 182];
  return `<g class="st-arm${side}"><line x1="${x1}" y1="172" x2="${x2}" y2="206" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><line x1="${x1}" y1="172" x2="${x2}" y2="206" stroke="${METAL}" stroke-width="8" stroke-linecap="round"/><circle cx="${x2}" cy="208" r="11" fill="${Y}" stroke="${INK}" stroke-width="5"/></g>`;
};

const BODY = `
  <ellipse cx="100" cy="252" rx="62" ry="9" fill="#000" opacity=".25"/>
  <rect x="50" y="226" width="40" height="22" rx="11" fill="${DARK}" stroke="${INK}" stroke-width="4"/>
  <rect x="110" y="226" width="40" height="22" rx="11" fill="${DARK}" stroke="${INK}" stroke-width="4"/>
  <g class="st-bob">${ARM('L')}${ARM('R')}
    <rect x="86" y="134" width="28" height="16" rx="4" fill="${DARK}" stroke="${INK}" stroke-width="3"/>
    <rect x="38" y="146" width="124" height="88" rx="28" fill="${Y}" stroke="${INK}" stroke-width="6"/>
    <rect x="60" y="164" width="80" height="44" rx="6" fill="none" stroke="${INK}" stroke-width="5"/>
    <text x="100" y="198" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-style="italic" font-size="31" fill="${INK}">STB</text>
    ${HEAD}</g>`;

export function stanOn() { try { return localStorage.getItem('stb-stan') !== 'off'; } catch { return true; } }
export function setStan(on) { try { localStorage.setItem('stb-stan', on ? 'on' : 'off'); } catch { /* private mode */ } }

/** Stan as an element. `head` = just his head (the Assistant button). Decorative unless given a label. */
export function stan({ pose = 'idle', size = 48, head = false, label = '' } = {}) {
  const el = document.createElement('span');
  el.className = `stan st-${pose}${head ? ' st-head' : ''}`;
  el.style.setProperty('--stan', `${size}px`);
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
  el.innerHTML = head
    ? `<svg viewBox="20 -18 160 164" focusable="false">${HEAD}</svg>`
    : `<svg viewBox="0 -26 200 288" focusable="false">${BODY}</svg>`;
  return el;
}

/** Mouth lights say how he's guiding: route = turn by turn (blue), point = pointing at the stop (amber), wait = no GPS (grey). */
export function stanState(el, state) { if (el) el.dataset.state = state || ''; }

/** Talking while the phone speaks (mouth lights blink, antenna pin pulses). */
export function stanTalk(el, on) { el?.classList.toggle('st-talking', !!on); }
