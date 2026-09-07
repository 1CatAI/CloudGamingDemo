import assert from 'node:assert/strict';
const base='http://127.0.0.1:8080';
const get=async path=>{const res=await fetch(base+path);return {status:res.status,data:await res.json()};};
const post=async(path,data)=>{const res=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};};
const before=await get('/demo/status');
assert.equal(before.status,200); assert.equal(before.data.ready,true);
assert.equal((await fetch(base+'/local.json')).status,404);
assert.equal((await fetch(base+'/api/login',{method:'POST'})).status,404);
assert.equal((await post('/demo/heartbeat',{token:'invalid'})).status,409);
assert.equal((await fetch(base+'/upstream/stream/index.js')).status,200);
if(before.data.busy){console.log('HTTP routes verified; active player left undisturbed.');process.exit(0);}
const first=await post('/demo/session',{});assert.equal(first.status,200);
assert.equal((await post('/demo/session',{})).status,409);
await new Promise(r=>setTimeout(r,4400));
const after=await get('/demo/status');
assert.equal(after.data.busy,false);
assert.equal(after.data.ready,true,JSON.stringify(after.data));
assert.equal((await post('/demo/heartbeat',{token:first.data.token})).status,409);
console.log('HTTP routes, exclusive session and live host watchdog verified.');
