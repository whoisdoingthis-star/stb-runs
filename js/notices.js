// The notice board (decision 0041): a note anyone can leave for the family. Stan shows it to each person
// the next time they open the app, and they tap Got it. Pure: the app and the tests both use these.

export const NOTICE_DAYS = 3;     // a note lasts this long unless it's kept until removed
export const NOTICE_MAX = 500;

/** Tidy what was typed; null if there's nothing to send. */
export function cleanNotice(text) {
  const t = String(text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTICE_MAX);
  return t || null;
}
export const expiryFor = (keep, now = Date.now()) => (keep === 'forever' ? null : new Date(now + NOTICE_DAYS * 864e5).toISOString());
export const isLive = (n, now = Date.now()) => !n.removed_at && (!n.expires_at || Date.parse(n.expires_at) > now);
const forMe = (n, name) => !n.to_names?.length || n.to_names.includes(name);
const hasSeen = (seen, id, name) => seen.some((s) => s.notice_id === id && s.user_name === name);

/** Who a note is for: the people picked, or everyone; never the person who wrote it. */
export const audience = (n, people) => (n.to_names?.length ? n.to_names : people).filter((p) => p !== n.from_name);

/** The notes Stan still has to show this person, oldest first. */
export function unreadFor(notices, seen, name, now = Date.now()) {
  return notices.filter((n) => isLive(n, now) && n.from_name !== name && forMe(n, name) && !hasSeen(seen, n.id, name))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
/** The board as one person sees it: live notes for them or from them, newest first. */
export function boardFor(notices, name, now = Date.now()) {
  return notices.filter((n) => isLive(n, now) && (n.from_name === name || forMe(n, name))).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
/** Who has tapped Got it, and who hasn't yet. */
export function seenBy(n, seen, people) {
  const who = audience(n, people);
  return { seen: who.filter((p) => hasSeen(seen, n.id, p)), waiting: who.filter((p) => !hasSeen(seen, n.id, p)) };
}
