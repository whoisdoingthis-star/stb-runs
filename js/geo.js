// GPS while a run is open. Tracking starts when the run opens, so a tap can
// use the latest fix straight away and the tile never waits for GPS.

const FRESH_MS = 15000;   // a fix younger than this is used as-is
const WAIT_MS = 4000;     // otherwise wait this long for a new one, then save without

export class Geo {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.last = null;      // { lat, lng, acc, t }
    this.state = 'off';    // off | waiting | ok | denied | unsupported | error
    this.watchId = null;
    this.waiters = [];
    this.listeners = new Set(); // e.g. the Driver Assistant, called on every fix
  }
  /** Call fn on every new fix; returns a function that stops it. */
  onFix(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  start() {
    if (!('geolocation' in navigator)) { this.set('unsupported'); return; }
    if (this.watchId != null) return;
    this.set('waiting');
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        this.last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now(),
          heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null, speed: Number.isFinite(p.coords.speed) ? p.coords.speed : null };
        this.listeners.forEach((fn) => { try { fn(this.last); } catch { /* a listener's problem isn't GPS's */ } });
        this.set('ok');
        const w = this.waiters; this.waiters = [];
        w.forEach((fn) => fn(this.last));
      },
      (err) => this.set(err.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  }
  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.set('off');
  }
  set(s) { this.state = s; this.onChange(this); }
  /** Best fix for a tap made at time `at` (ms). Resolves to null if none arrives in time. */
  fixFor(at) {
    const fresh = this.last && at - this.last.t < FRESH_MS;
    if (fresh || this.state === 'denied' || this.state === 'unsupported') return Promise.resolve(fresh ? this.last : null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.waiters = this.waiters.filter((f) => f !== done); resolve(this.last && at - this.last.t < 60000 ? this.last : null); }, WAIT_MS);
      const done = (fix) => { clearTimeout(timer); resolve(fix); };
      this.waiters.push(done);
    });
  }
  label() {
    switch (this.state) {
      case 'ok': return `GPS ±${Math.round(this.last.acc)} m`;
      case 'waiting': return 'GPS…';
      case 'denied': return 'GPS off';
      case 'unsupported': return 'No GPS';
      case 'error': return 'GPS weak';
      default: return '';
    }
  }
}
