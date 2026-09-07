import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionLease } from '../lib/session.mjs';

test('only one player; stale tokens cannot keep another session alive', async () => {
  let time = 0; const stops = [];
  const lease = new SessionLease({now:()=>time, timeoutMs:3500, onExpire:r=>stops.push(r)});
  const first = lease.acquire();
  assert.throws(()=>lease.acquire(), /BUSY/);
  assert.equal(lease.touch('wrong'), false);
  time = 3501; await lease.tick();
  assert.deepEqual(stops, ['heartbeat-timeout']);
  const second = lease.acquire();
  assert.notEqual(first, second);
  assert.equal(await lease.release(first), false);
  assert.equal(lease.owns(second), true);
});
test('new player waits for host cleanup; a fresh heartbeat prevents expiry', async () => {
  let time = 0; let complete;
  const lease = new SessionLease({now:()=>time, onExpire:()=>new Promise(r=>{complete=r;})});
  const token = lease.acquire();
  time = 3000; lease.touch(token);
  time = 5000; assert.equal(await lease.tick(), false);
  const ending = lease.release(token);
  await Promise.resolve();
  assert.throws(()=>lease.acquire(), /BUSY/);
  complete(); await ending;
  assert.ok(lease.acquire());
});
test('failed host cleanup blocks another player instead of claiming success', async () => {
  const lease=new SessionLease({onExpire:async()=>{throw new Error('host unavailable');}});
  await assert.rejects(lease.release(lease.acquire()),/host unavailable/);
  assert.ok(lease.fault);
  assert.throws(()=>lease.acquire(),/BUSY/);
});
