/**
 * Send The Boy: nightly backup to Google Drive (decision 0079).
 * A Google Apps Script that runs in Mike's Google account every evening, in Google's cloud (no laptop needed):
 * it asks the database for a full copy and saves it, compressed, in the Drive folder "STB backups".
 *
 * Set up once (about 5 minutes):
 *   1. A Claude session opens a 30-minute enrolment window:  select bridge_open_enrolment('gdrive-backup');
 *   2. script.google.com → New project → name it "STB backup" → paste this whole file over the starter code → Save.
 *   3. Choose the function "setup" at the top and press Run. Allow the permissions it asks for (Drive, and
 *      connecting to an external service). It makes its own secret, enrols it, sets the nightly trigger and
 *      takes the first backup. The secret stays in this script's properties; nobody sees it.
 *
 * Photos (decision 0080): each night it also copies any delivery photo it hasn't copied yet into "STB backups/photos",
 * through the edge function backup-photos (30-minute links, device secret), a few minutes' worth at a time; the first
 * night catches up on the backlog over a run or two. Photos are kept in Drive for good (they stay in Supabase too).
 *
 * Updating this script: paste the new version over the old one in the same Apps Script project and Save. No need to
 * run setup again.
 *
 * Keeps: every night for 30 days, plus the 1st of each month for a year. Failures email Mike (Apps Script does this
 * for failed triggers) and any Claude session can see when it last ran: select * from bridge_status();
 * The copy holds family and customer details (addresses, door codes): it stays in Mike's own Drive. Don't share the folder.
 */
const SUPABASE_URL = 'https://oqeodnonztzesiingrnt.supabase.co';
const PUBLIC_KEY = 'sb_publishable_3uhllytUx1zdzng43u5sfQ_uJ1_H6bm';   // the app's public key (it's in the app too): useless without the secret
const DEVICE = 'gdrive-backup';
const FOLDER = 'STB backups';
const HOUR = 22;   // 10 pm New Zealand time, after the evening run-sheet fetch

function setup() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SECRET');
  if (!secret) { secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props.setProperty('SECRET', secret); }
  if (props.getProperty('ENROLLED') !== 'yes') {
    const ok = rpc_('bridge_enrol', { p_device: DEVICE, p_secret: secret });
    if (ok !== true) throw new Error('Enrolment refused. Ask Claude to open the window (bridge_open_enrolment), then press Run again within 30 minutes.');
    props.setProperty('ENROLLED', 'yes');
  }
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backup').timeBased().everyDays(1).atHour(HOUR).inTimezone('Pacific/Auckland').create();
  backup();
}

function backup() {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret) throw new Error('Not set up yet: run setup first.');
  const data = rpc_('stb_backup_export', { p_device: DEVICE, p_secret: secret });
  if (!data || !data.tables) throw new Error('The database refused the backup (wrong or missing secret).');
  const day = Utilities.formatDate(new Date(), 'Pacific/Auckland', 'yyyy-MM-dd');
  const name = `stb-${day}.json`;
  const gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(data), 'application/json', name), name + '.gz');
  const folder = folder_();
  const same = folder.getFilesByName(name + '.gz'); while (same.hasNext()) same.next().setTrashed(true);   // re-run the same day: keep one
  folder.createFile(gz);
  prune_(folder);
  const rows = Object.values(data.tables).reduce((n, t) => n + t.length, 0);
  console.log(`Saved ${name}.gz: ${Object.keys(data.tables).length} tables, ${rows} rows, ${Math.round(gz.getBytes().length / 1024)} KB.`);
  backupPhotos();
}

// Copy photos not yet in Drive, in batches, stopping before Apps Script's 6-minute limit (the rest go tomorrow).
function backupPhotos() {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  const started = Date.now(); let copied = 0; let failed = 0;
  const root = folder_(); const sub = root.getFoldersByName('photos'); const photos = sub.hasNext() ? sub.next() : root.createFolder('photos');
  while (Date.now() - started < 4 * 60 * 1000) {
    const r = UrlFetchApp.fetch(`${SUPABASE_URL}/functions/v1/backup-photos`, {
      method: 'post', contentType: 'application/json', headers: { apikey: PUBLIC_KEY },
      payload: JSON.stringify({ device: DEVICE, secret: secret, limit: 40 }), muteHttpExceptions: true,
    });
    if (r.getResponseCode() !== 200) throw new Error(`backup-photos: ${r.getResponseCode()} ${r.getContentText().slice(0, 200)}`);
    const list = JSON.parse(r.getContentText()).photos || [];
    if (!list.length) break;
    const done = [];
    for (const p of list) {
      if (Date.now() - started > 5 * 60 * 1000) break;
      try {
        const f = UrlFetchApp.fetch(p.url, { muteHttpExceptions: true });
        if (f.getResponseCode() !== 200) { failed++; continue; }
        const file = photos.createFile(f.getBlob().setName(`${p.bucket}__${p.name.replace(/\//g, '__')}`));
        done.push({ bucket: p.bucket, name: p.name, size: p.size, drive_file_id: file.getId() });
      } catch (e) { failed++; }
    }
    if (done.length) rpc_('photo_copied', { p_device: DEVICE, p_secret: secret, p_items: done });
    copied += done.length;
    if (!done.length) break;   // nothing would copy: stop rather than loop
  }
  console.log(`Photos: ${copied} copied to Drive${failed ? `, ${failed} couldn't be fetched (tried again tomorrow)` : ''}.`);
}

function folder_() {
  const found = DriveApp.getFoldersByName(FOLDER);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER);
}

// Keep 30 nightly copies and the 1st of each month for a year; older ones go to the bin (Drive empties it after 30 days).
function prune_(folder) {
  const now = Date.now(); const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next(); const m = /^stb-(\d{4})-(\d{2})-(\d{2})\.json\.gz$/.exec(f.getName()); if (!m) continue;
    const age = (now - new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+13:00`).getTime()) / 864e5;
    if (age > 30 && !(m[3] === '01' && age <= 366)) f.setTrashed(true);
  }
}

function rpc_(fn, body) {
  const r = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'post', contentType: 'application/json', headers: { apikey: PUBLIC_KEY },
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  if (r.getResponseCode() >= 300) throw new Error(`${fn}: ${r.getResponseCode()} ${r.getContentText().slice(0, 200)}`);
  return JSON.parse(r.getContentText());
}
