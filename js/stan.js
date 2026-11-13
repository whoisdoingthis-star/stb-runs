// Stan: STB's little robot. Mike's own design (14 Nov 2026): docs/decisions/0032-stan-new-look.md (first look: 0021)
// He is the face of help and good news, never something you need in order to understand a screen:
// he always comes with words, keeps still for "reduce motion", and Settings -> Stan turns him off.
//
//   stan({ pose, size, head, label })  an element; pose = idle | talk | wave | hop | point
//   stanState(el, state)               voice lights on his screen: route (blue) | point (amber) | wait (grey)
//   stanOn()                           the family's Settings switch (on unless turned off)

const INK = '#17130a'; const CY = '#22e6f2'; const EDGE = '#c77700'; const LIMB_EDGE = '#5a5e66';

// Shared paints. Every Stan on the page carries the same ones, so it doesn't matter which copy the browser uses.
const DEFS = `<defs>
  <radialGradient id="stn-y" cx=".35" cy=".22" r=".95"><stop offset="0" stop-color="#ffe680"/><stop offset=".42" stop-color="#ffc400"/><stop offset="1" stop-color="#ec9300"/></radialGradient>
  <linearGradient id="stn-k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#565a61"/><stop offset=".5" stop-color="#2a2c31"/><stop offset="1" stop-color="#141518"/></linearGradient>
  <filter id="stn-g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;

// The head is most of him: glossy yellow, a dark screen for a face, cyan eyes, his name signed underneath.
const HEAD = `
  <line x1="100" y1="36" x2="100" y2="20" stroke="#8a8f98" stroke-width="3" stroke-linecap="round"/>
  <g class="st-pin"><path d="M100 22C90 10 87 4 87 -1A13 13 0 1 1 113 -1C113 4 110 10 100 22Z" fill="url(#stn-y)" stroke="${EDGE}" stroke-width="1.5"/><circle cx="100" cy="-1" r="5" fill="${INK}"/>
    <g class="st-spark" stroke="#ffc400" stroke-width="3.5" stroke-linecap="round"><path d="M78 -10l-9 -6"/><path d="M80 6l-11 2"/><path d="M122 -10l9 -6"/><path d="M120 6l11 2"/></g></g>
  <rect x="30" y="34" width="140" height="126" rx="42" fill="url(#stn-y)" stroke="${EDGE}" stroke-width="2"/>
  <path d="M52 47q48 -13 96 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
  <rect x="45" y="56" width="110" height="70" rx="25" fill="#07181c" stroke="#d98f00" stroke-width="2.5"/>
  <g class="st-eyes" fill="${CY}" stroke="${CY}" filter="url(#stn-g)">
    <rect x="70" y="72" width="17" height="27" rx="8.5" stroke="none"/>
    <rect class="st-eye-open" x="113" y="72" width="17" height="27" rx="8.5" stroke="none"/>
    <path class="st-eye-wink" d="M110 90q11.5 -15 23 0" fill="none" stroke-width="5" stroke-linecap="round"/></g>
  <g class="st-mouth">${[0, 1, 2, 3, 4].map((i) => `<rect x="${84 + i * 7}" y="${[110, 107, 105, 107, 110][i]}" width="4" height="${[5, 11, 15, 11, 5][i]}" rx="2"/>`).join('')}</g>
  <g class="st-name" transform="rotate(-5 118 146)"><text x="118" y="150" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-style="italic" font-size="23" fill="${INK}">Stan</text>
    <path d="M96 156q22 -5 44 -2" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`;

const TIP = (d) => `<path d="${d}" fill="${CY}" filter="url(#stn-g)"/>`;
// Arms are drawn pointing right from the shoulder, then turned into place, so the glowing tip stays on the end.
const ARM = (side) => {
  const [sx, sy, rot, len] = side === 'L' ? [44, 162, 152, 34] : [158, 160, -38, 44];
  return `<g class="st-arm${side}"><g transform="translate(${sx} ${sy}) rotate(${rot})"><rect x="-8" y="-12" width="${len + 8}" height="24" rx="12" fill="url(#stn-k)" stroke="${LIMB_EDGE}" stroke-width="1"/>${TIP(`M${len - 14} -12h2a12 12 0 0 1 0 24h-2a13 13 0 0 0 0 -24z`)}</g></g>`;
};
const LEG = (x, r) => `<g transform="rotate(${r} ${x + 14} 172)"><rect x="${x}" y="168" width="28" height="64" rx="14" fill="url(#stn-k)" stroke="${LIMB_EDGE}" stroke-width="1"/>${TIP(`M${x} 216q14 6 28 0v2a14 14 0 0 1 -28 0z`)}</g>`;

const BODY = `
  <ellipse class="st-floor" cx="100" cy="252" rx="56" ry="6" fill="${CY}" opacity=".3"/>
  <g class="st-bob">${LEG(58, 10)}${LEG(104, 3)}${ARM('L')}${ARM('R')}
    <rect x="26" y="140" width="148" height="40" rx="20" fill="url(#stn-k)" stroke="${LIMB_EDGE}" stroke-width="1"/>
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
    ? `<svg viewBox="14 -22 172 186" focusable="false">${DEFS}${HEAD}</svg>`
    : `<svg viewBox="0 -26 200 288" focusable="false">${DEFS}${BODY}</svg>`;
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
