/** Minimal synchronous event emitter. */
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  removeAll() {
    this._listeners.clear();
  }
}
