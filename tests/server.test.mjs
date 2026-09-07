import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {createDemoServer} from '../server.mjs';
async function fixture(t){
 const host={paired:'Paired',server_state:'Free',current_game:0};
 let refuseCancel=false;
 const app=createDemoServer({local:{gatewayPort:9,hostId:1,appId:2,gatewayToken:'test',staticPath:'public',encoder:'nvenc'},log:()=>{},requestUpstream:async url=>{
   if(url.includes('/host/cancel')) return {data:{success:!refuseCancel}};
   if(url.includes('/api/host?')) return {data:{host}};
   return {data:{}};
 }});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(()=>app.shutdown());
 const port=app.server.address().port;
 return {...app,host,port,base:`http://127.0.0.1:${port}`,refuse:()=>{refuseCancel=true;}};
}
test('offline Sunshine is not advertised as ready and cannot acquire a session',async t=>{
 const f=await fixture(t);f.host.server_state=null;
 assert.equal((await (await fetch(f.base+'/demo/status')).json()).ready,false);
 assert.equal((await fetch(f.base+'/demo/session',{method:'POST',body:'{}'})).status,503);
 assert.equal(f.lease.active,null);
});
test('malformed JSON returns 400 without taking a session',async t=>{
 const f=await fixture(t);
 for(const body of ['{','null','[]']) assert.equal((await fetch(f.base+'/demo/session',{method:'POST',body})).status,400);
 assert.equal(f.lease.active,null);
});
test('an invalid upgrade URL cannot crash the HTTP server',async t=>{
 const f=await fixture(t);
 const response=await new Promise((resolve,reject)=>{
  const socket=net.connect(f.port,'127.0.0.1',()=>socket.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
  let text='';socket.on('data',c=>text+=c);socket.on('end',()=>resolve(text));socket.on('error',reject);
  socket.setTimeout(1000,()=>socket.destroy(new Error('timeout')));
 });
 assert.match(response,/400/);
 assert.equal((await fetch(f.base+'/demo/status')).status,200);
});
test('negative host cancellation is surfaced and blocks a new player',async t=>{
 const f=await fixture(t);f.refuse();const token=f.lease.acquire();
 await assert.rejects(f.lease.release(token),/confirm cancellation/);
 assert.equal((await (await fetch(f.base+'/demo/status')).json()).ready,false);
});
test('success response with an active host session is not mistaken for cleanup',async t=>{
 const f=await fixture(t);f.host.current_game=2;const token=f.lease.acquire();
 await assert.rejects(f.lease.release(token),/still reports/);
 assert.ok(f.lease.fault);
});
