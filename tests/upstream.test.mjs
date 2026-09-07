import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {request} from '../lib/upstream.mjs';
async function fixture(t,handler){
 const server=http.createServer(handler);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 return `http://127.0.0.1:${server.address().port}`;
}
test('an aborted response rejects instead of leaving cleanup pending forever',{timeout:700},async t=>{
 const url=await fixture(t,(_req,res)=>{res.writeHead(200);res.write('{');setImmediate(()=>res.destroy());});
 await assert.rejects(request(url,{timeout:200}),/aborted|closed|reset|socket/i);
});
test('the deadline also bounds a response that keeps trickling bytes',{timeout:700},async t=>{
 let interval;
 const url=await fixture(t,(_req,res)=>{res.writeHead(200);res.write('{');interval=setInterval(()=>res.write(' '),20);res.on('close',()=>clearInterval(interval));});
 t.after(()=>clearInterval(interval));
 await assert.rejects(request(url,{timeout:120}),/timeout/i);
});
