// Icons for people (decision 0025; Mike's idea, sent through Chat with Stan on 13 Nov 2026).
// Each person picks a ready-made icon (little robots, Stan's cousins: original drawings) or uploads a photo,
// which is cropped to a small square on the phone before it is saved. Nobody chosen = initials on a colour.
//
//   avatar(name, size)          an element for that person, from what's been loaded
//   setKnown(map)               { name: { kind: 'icon'|'photo', value } } from the store
//   ICONS                       the ready-made set; iconSvg(id) draws one
//   photoToDataUrl(file)        a 96x96 JPEG data URL from a picked photo

export const ICONS = {
  sunny: { c: '#fdb704', top: 'pin' }, sky: { c: '#38bdf8', top: 'star' }, mint: { c: '#34d399', top: 'leaf' },
  rose: { c: '#fb7185', top: 'heart' }, grape: { c: '#a78bfa', top: 'bolt' }, tang: { c: '#fb923c', top: 'ball' },
  lime: { c: '#a3e635', top: 'star' }, aqua: { c: '#2dd4bf', top: 'bolt' }, berry: { c: '#f472b6', top: 'ball' },
  storm: { c: '#94a3b8', top: 'pin' }, coral: { c: '#f87171', top: 'leaf' }, royal: { c: '#818cf8', top: 'heart' },
};
const TOPS = {
  pin: (c) => `<path d="M50 20C44 13 42 9 42 6a8 8 0 1 1 16 0c0 3-2 7-8 14Z" fill="${c}" stroke="#111" stroke-width="3"/>`,
  ball: (c) => `<line x1="50" y1="24" x2="50" y2="12" stroke="#111" stroke-width="4"/><circle cx="50" cy="9" r="6.5" fill="${c}" stroke="#111" stroke-width="3"/>`,
  star: (c) => `<line x1="50" y1="24" x2="50" y2="16" stroke="#111" stroke-width="4"/><path d="M50 0l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L50 16.5l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1Z" fill="${c}" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>`,
  heart: (c) => `<line x1="50" y1="24" x2="50" y2="17" stroke="#111" stroke-width="4"/><path d="M50 19C40 12 40 3 45.5 3c2.5 0 4 1.5 4.5 3 .5-1.5 2-3 4.5-3C60 3 60 12 50 19Z" fill="${c}" stroke="#111" stroke-width="2.5"/>`,
  bolt: (c) => `<path d="M54 0 42 13h7l-4 11 13-14h-7Z" fill="${c}" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>`,
  leaf: (c) => `<line x1="50" y1="24" x2="50" y2="12" stroke="#111" stroke-width="4"/><path d="M50 14C50 5 57 1 65 2c1 8-4 13-15 12Z" fill="${c}" stroke="#111" stroke-width="2.5"/><path d="M50 14C50 7 45 3 38 4c-1 6 3 10 12 10Z" fill="${c}" stroke="#111" stroke-width="2.5"/>`,
};
/** One ready-made icon as SVG markup (a robot head in its colour, with its own antenna top). */
export function iconSvg(id) {
  const i = ICONS[id] || ICONS.sunny;
  return `<svg viewBox="0 0 100 100" focusable="false"><rect width="100" height="100" rx="50" fill="${i.c}" opacity=".22"/>
    ${TOPS[i.top](i.c)}<rect x="14" y="24" width="72" height="56" rx="20" fill="${i.c}" stroke="#111" stroke-width="4"/>
    <rect x="24" y="33" width="52" height="36" rx="12" fill="#0e0f11"/><rect x="35" y="41" width="10" height="14" rx="5" fill="#fff"/><rect x="55" y="41" width="10" height="14" rx="5" fill="#fff"/>
    <rect x="41" y="60" width="18" height="3.5" rx="1.7" fill="#4ade80"/></svg>`;
}

const COLOURS = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
/** Only a small JPEG or PNG made by this app counts as a photo (nothing else is ever put in an <img>). */
export const okPhoto = (v) => typeof v === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 60000;

let known = {};
export function setKnown(map) { known = map || {}; if (typeof document !== 'undefined') refreshAvatars(); }
export const knownAvatars = () => known;

/** That person's icon as an element (decorative: their name is always written beside it). */
export function avatar(name, size = 28, choice) {
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true'); el.style.setProperty('--av', `${size}px`);
  if (!choice) el.dataset.who = name; // so it can be redrawn when that person changes their icon
  paint(el, name, choice);
  return el;
}
/** Redraw every icon on the screen (after someone picks a new one, or fresh ones arrive). */
export function refreshAvatars(root = document) { for (const el of root.querySelectorAll('.avatar[data-who]')) paint(el, el.dataset.who); }
function paint(el, name, choice) {
  const a = choice || known[name];
  el.className = 'avatar'; el.style.background = ''; el.replaceChildren();
  if (a?.kind === 'photo' && okPhoto(a.value)) { const img = new Image(); img.src = a.value; img.alt = ''; el.append(img); }
  else if (a?.kind === 'icon' && ICONS[a.value]) el.innerHTML = iconSvg(a.value);
  else { el.textContent = initials(name); el.classList.add('av-initials'); el.style.background = COLOURS[hash(name) % COLOURS.length]; }
}

/** A picked photo, cropped to the middle square and shrunk to 96x96, as a JPEG data URL (about 5 KB). */
export async function photoToDataUrl(file, size = 96) {
  const bmp = await (window.createImageBitmap ? createImageBitmap(file) : new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); }));
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.82);
}
