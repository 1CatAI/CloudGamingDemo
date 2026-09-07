import { randomBytes } from 'node:crypto';

// A single host desktop is shared by exactly one demo player at a time.
export class SessionLease {
  constructor({ timeoutMs = 3500, now = Date.now, onExpire = async () => {} } = {}) {
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.onExpire = onExpire;
    this.active = null;
    this.closing = null;
    this.fault = null;
  }
  acquire() {
    if (this.active || this.closing || this.fault) throw new Error('BUSY');
    const token = randomBytes(24).toString('hex');
    this.active = { token, touched: this.now() };
    return token;
  }
  owns(token) { return Boolean(token && this.active?.token === token); }
  touch(token) {
    if (!this.owns(token)) return false;
    this.active.touched = this.now();
    return true;
  }
  async release(token, reason = 'disconnect') {
    if (!this.owns(token)) return false;
    this.active = null;
    this.closing = Promise.resolve().then(() => this.onExpire(reason));
    try { await this.closing; }
    catch (error) { this.fault = error; throw error; }
    finally { this.closing = null; }
    return true;
  }
  async tick() {
    if (this.active && this.now() - this.active.touched > this.timeoutMs) {
      return this.release(this.active.token, 'heartbeat-timeout');
    }
    return false;
  }
}
