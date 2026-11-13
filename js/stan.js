// Stan: STB's little robot. Mike's own design (14 Nov 2026): docs/decisions/0033-brand.md (earlier looks: 0032, 0021)
// He is the face of help and good news, never something you need in order to understand a screen:
// he always comes with words, keeps still for "reduce motion", and Settings -> Stan turns him off.
//
//   stan({ pose, size, head, label })  an element; pose = idle | talk | wave | hop | point
//   stanState(el, state)               voice lights on his screen: route (blue) | point (amber) | wait (grey)
//   stanOn()                           the family's Settings switch (on unless turned off)

const INK = '#17130a'; const CY = '#22e6f2'; const EDGE = '#c77700'; const LIMB_EDGE = '#5a5e66';
const FONT = 'font-family="system-ui, sans-serif" font-weight="900" font-style="italic"';

// Shared paints. Every Stan on the page carries the same ones, so it doesn't matter which copy the browser uses.
const DEFS = `<defs>
  <radialGradient id="stn-y" cx=".35" cy=".22" r=".95"><stop offset="0" stop-color="#ffe680"/><stop offset=".42" stop-color="#ffc400"/><stop offset="1" stop-color="#ec9300"/></radialGradient>
  <linearGradient id="stn-k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#565a61"/><stop offset=".5" stop-color="#2a2c31"/><stop offset="1" stop-color="#141518"/></linearGradient>
  <linearGradient id="stn-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2e33"/><stop offset="1" stop-color="#0c0d0f"/></linearGradient>
  <filter id="stn-g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="stn-egg"><path d="M100 30c52 0 76 30 76 72c0 44-30 66-76 66s-76-22-76-66c0-42 24-72 76-72z"/></clipPath>
</defs>`;

const EGG = 'M100 30c52 0 76 30 76 72c0 44-30 66-76 66s-76-22-76-66c0-42 24-72 76-72z';
// What's written on his black band: his own name in the app, the business name on the logo and the opening.
const BAND = {
  none: '',
  stan: `<g class="st-name" transform="rotate(-4 100 144)"><text x="100" y="150" text-anchor="middle" ${FONT} font-size="23" fill="#ffc400">Stan</text><path d="M78 157q22-5 44-2" fill="none" stroke="#ffc400" stroke-width="2.6" stroke-linecap="round"/></g>`,
  stb: `<g class="st-name" transform="rotate(-4 100 144)"><text x="100" y="147" text-anchor="middle" ${FONT} font-size="19"><tspan fill="#fff">Send </tspan><tspan fill="#ffc400">The Boy</tspan></text><path d="M64 155q38-7 74-5" fill="none" stroke="#ffc400" stroke-width="3" stroke-linecap="round"/></g>`,
};
const arc = (x, cls = '') => `<path ${cls ? `class="${cls}" ` : ''}d="M${x - 11} 89q11-15 22 0" fill="none" stroke-width="5" stroke-linecap="round"/>`;

/**
 * The head is most of him (Mike's design, decision 0033): a rounded yellow head with a black lower band,
 * a dark screen for a face, cyan eyes, and the map-pin antenna. `band`: none | stan | stb.
 * Eyes: both open; .st-eye-wink and .st-eye-happy are drawn too and shown by CSS or by the opening animation.
 */
export const stanHead = (band = 'none') => `
  <line x1="100" y1="34" x2="100" y2="20" stroke="#8a8f98" stroke-width="3" stroke-linecap="round"/>
  <g class="st-pin"><path d="M100 22C90 10 87 4 87-1A13 13 0 1 1 113-1C113 4 110 10 100 22Z" fill="url(#stn-y)" stroke="${EDGE}" stroke-width="1.5"/><circle cx="100" cy="-1" r="5" fill="${INK}"/>
    <g class="st-spark" stroke="#ffc400" stroke-width="3.5" stroke-linecap="round"><path d="M78-10l-9-6"/><path d="M80 6l-11 2"/><path d="M122-10l9-6"/><path d="M120 6l11 2"/></g></g>
  <g clip-path="url(#stn-egg)"><rect x="20" y="26" width="160" height="150" fill="url(#stn-y)"/><path d="M20 123q80-16 160 0v60h-160z" fill="url(#stn-b)"/></g>
  <path d="${EGG}" fill="none" stroke="${EDGE}" stroke-width="2"/>
  <path d="M56 46q44-14 88 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
  <rect x="48" y="56" width="104" height="60" rx="24" fill="#07181c" stroke="#d98f00" stroke-width="2.5"/>
  <g class="st-eyes" fill="${CY}" stroke="${CY}" filter="url(#stn-g)">
    <rect class="st-eye-l" x="70" y="70" width="17" height="27" rx="8.5" stroke="none"/>
    <rect class="st-eye-open" x="113" y="70" width="17" height="27" rx="8.5" stroke="none"/>
    ${arc(121.5, 'st-eye-wink')}<g class="st-eye-happy">${arc(78.5)}${arc(121.5)}</g></g>
  <g class="st-mouth">${[0, 1, 2, 3, 4].map((i) => `<rect x="${86 + i * 6}" y="${[105, 103, 102, 103, 105][i]}" width="3.5" height="${[5, 9, 11, 9, 5][i]}" rx="1.75"/>`).join('')}</g>
  ${BAND[band] || ''}`;
export const STAN_DEFS = DEFS;

const TIP = (d) => `<path d="${d}" fill="${CY}" filter="url(#stn-g)"/>`;
// Arms are drawn pointing right from the shoulder, then turned into place, so the glowing tip stays on the end.
const ARM = (side) => {
  const [sx, sy, rot, len] = side === 'L' ? [34, 132, 148, 30] : [166, 130, -34, 40];
  return `<g class="st-arm${side}"><g transform="translate(${sx} ${sy}) rotate(${rot})"><rect x="-8" y="-12" width="${len + 8}" height="24" rx="12" fill="url(#stn-k)" stroke="${LIMB_EDGE}" stroke-width="1"/>${TIP(`M${len - 14}-12h2a12 12 0 0 1 0 24h-2a13 13 0 0 0 0-24z`)}</g></g>`;
};
const LEG = (x, r) => `<g transform="rotate(${r} ${x + 14} 160)"><rect x="${x}" y="150" width="28" height="64" rx="14" fill="url(#stn-k)" stroke="${LIMB_EDGE}" stroke-width="1"/>${TIP(`M${x} 198q14 6 28 0v2a14 14 0 0 1-28 0z`)}</g>`;

const BODY = `
  <ellipse class="st-floor" cx="100" cy="234" rx="56" ry="6" fill="${CY}" opacity=".3"/>
  <g class="st-bob">${LEG(60, 9)}${LEG(106, 2)}${ARM('L')}${ARM('R')}
    ${stanHead('stan')}</g>`;
const HEAD = stanHead('none');

/** The logo: Stan beside the name (decision 0033). `ink`: colour of "Send" (white on dark, near-black on light). */
export function stbLogo({ height = 64, ink = 'currentColor', outline = false, label = 'Send The Boy' } = {}) {
  const el = document.createElement('span');
  el.className = 'stb-logo'; el.style.height = `${height}px`; el.setAttribute('role', 'img'); el.setAttribute('aria-label', label);
  el.innerHTML = `<svg viewBox="0 -24 560 204" focusable="false" style="height:100%;width:auto;overflow:visible">${DEFS}
    <g class="st-logo-stan">${stanHead('stan')}</g>
    <g transform="rotate(-4 380 90)"><text x="208" y="74" ${FONT} font-size="76" fill="${ink}">Send</text><text x="208" y="146" ${FONT} font-size="76" fill="#ffc400"${outline ? ` stroke="${EDGE}" stroke-width="1.2"` : ''}>The Boy</text>
      <path d="M210 176q170-20 330-10" fill="none" stroke="#ffc400" stroke-width="9" stroke-linecap="round"/></g></svg>`;
  return el;
}

export function stanOn() { try { return localStorage.getItem('stb-stan') !== 'off'; } catch { return true; } }
export function setStan(on) { try { localStorage.setItem('stb-stan', on ? 'on' : 'off'); } catch { /* private mode */ } }

/** Stan as an element. `head` = just his head (the Assistant button). Decorative unless given a label. */
export function stan({ pose = 'idle', size = 48, head = false, label = '' } = {}) {
  const el = document.createElement('span');
  el.className = `stan st-${pose}${head ? ' st-head' : ''}`;
  el.style.setProperty('--stan', `${size}px`);
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
  el.innerHTML = head
    ? `<svg viewBox="12 -22 176 196" focusable="false">${DEFS}${HEAD}</svg>`
    : `<svg viewBox="0 -44 200 288" focusable="false">${DEFS}${BODY}</svg>`;
  return el;
}

/** Mouth lights say how he's guiding: route = turn by turn (blue), point = pointing at the stop (amber), wait = no GPS (grey). */
export function stanState(el, state) { if (el) el.dataset.state = state || ''; }

/** Talking while the phone speaks (mouth lights blink, antenna pin pulses). */
export function stanTalk(el, on) { el?.classList.toggle('st-talking', !!on); }

/**
 * An empty screen or a calm message, said by Stan: him beside the words. With Stan hidden, just the words.
 * `text` may be a string or an element.
 */
export function stanSays(text, { pose = 'idle', size = 56, cls = '' } = {}) {
  const box = document.createElement('div');
  box.className = `stan-says ${cls}`.trim();
  const words = typeof text === 'string' ? Object.assign(document.createElement('p'), { textContent: text }) : text;
  if (stanOn()) box.append(stan({ pose, size }));
  box.append(words);
  return box;
}

/** Stan's tips for Dispatch: one a day (same tip all day), plus a link to the full guide. */
export const DISPATCH_TIPS = [
  'Paper run today? Close it from Runs with the driver, so it drops to History and counts for them.',
  'Drag a tile in a run to change the order for everyone. Drivers’ own drags only change their phone.',
  'A tick in the wrong place? Undo it on the phone, or see the runbook to remove it here.',
  'Shifts: hover a piece of the bar to see what it was and how long it took.',
  'STOPNA on a sheet becomes a stop, not a complaint. Check Needs attention after loading.',
  'Set the depot once (Overview, Depot) and phones will tell drivers when they’ve arrived.',
  'Two rules that disagree are refused: change the dates on the old one first.',
];
export function tipOfDay(date = new Date()) {
  const day = Math.floor((date.getTime() + 13 * 3600e3) / 864e5);
  return DISPATCH_TIPS[day % DISPATCH_TIPS.length];
}
