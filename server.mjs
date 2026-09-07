import http from 'node:http';
import net from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { SessionLease } from './lib/session.mjs';
import { request } from './lib/upstream.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
export function createDemoServer({local,root=projectRoot,requestUpstream=request,log=message=>console.log(`${new Date().toISOString()} ${message}`)}) {
const upstreamPort = local.gatewayPort ?? 8091;
const upstream = `http://127.0.0.1:${upstreamPort}`;
const sockets = new Set();
const signalling = new Map();
const adminHeaders = () => ({ authorization: `Bearer ${local.gatewayToken}` });

const lease = new SessionLease({ onExpire: async reason => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  // Desktop is configured with no launch command: cancelling it does not kill
  // the game the owner started manually. It releases Sunshine's virtual input.
  const cancelled=await requestUpstream(`${upstream}/api/host/cancel`, { method: 'POST', json: { host_id: local.hostId }, headers: adminHeaders(),timeout:5000 });
  if(cancelled.data?.success !== true) throw new Error('Host did not confirm cancellation');
  let stopped=false;
  for(let i=0;i<3;i++){
    const response=await requestUpstream(`${upstream}/api/host?host_id=${local.hostId}`,{headers:adminHeaders(),timeout:2000});
    if(response.data?.host?.current_game === 0){stopped=true;break;}
    await new Promise(r=>setTimeout(r,100));
  }
  if(!stopped) throw new Error('Host still reports an active session after cancellation');
  log(`Session stopped: ${reason}`);
}});
const watchdog = setInterval(() => lease.tick().catch(e => log(`WATCHDOG ERROR: ${e.message}`)), 500);
watchdog.unref();

function reply(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readJson(req) {
  const chunks=[];let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if (bytes > 4096) throw Object.assign(new Error('Request too large'),{status:413});
    chunks.push(chunk);
  }
  try{
    const body=Buffer.concat(chunks).toString('utf8');
    const value=body ? JSON.parse(body) : {};
    if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
    return value;
  }catch{throw Object.assign(new Error('Expected a JSON object'),{status:400});}
}
function sameOrigin(req) {
  return !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
}
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.wasm':'application/wasm' };
async function staticFile(req, res, pathname) {
  const isUpstream = pathname.startsWith('/upstream/');
  const base = isUpstream ? path.resolve(root, local.staticPath) : path.join(root, 'public');
  const relative = isUpstream ? pathname.slice(10) : pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep) || !mime[path.extname(file)]) return reply(res, 404, { error: 'Not found' });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not file');
    res.writeHead(200, { 'content-type': mime[path.extname(file)], 'content-length': info.size, 'cache-control':'no-cache', 'x-content-type-options':'nosniff' });
    if (req.method === 'HEAD') return res.end();
    const stream=createReadStream(file);
    stream.once('error',()=>res.destroy());
    stream.pipe(res);
  } catch { reply(res, 404, { error: 'Not found' }); }
}
async function health(){
  if(lease.fault) return {ready:false,error:'主机回收失败，请重启 Demo 服务。'};
  try{
    await requestUpstream(`${upstream}/api/authenticate`,{headers:adminHeaders(),timeout:1500});
    const response=await requestUpstream(`${upstream}/api/host?host_id=${local.hostId}`,{headers:adminHeaders(),timeout:1500});
    const host=response.data?.host;
    if(host?.paired !== 'Paired' || host.server_state == null) return {ready:false,error:'Sunshine 主机离线或尚未配对。'};
    return {ready:true,error:null};
  }catch{return {ready:false,error:'串流主机暂不可用，请检查主机服务。'};}
}
const server = http.createServer(async (req, res) => {
  try {
    let url,pathname;
    try{url=new URL(req.url,'http://localhost');pathname=decodeURIComponent(url.pathname);}
    catch{return reply(res,400,{error:'Invalid URL'});}
    if (!sameOrigin(req)) return reply(res, 403, { error: 'Origin rejected' });
    if (req.method === 'GET' && pathname === '/demo/status') {
      return reply(res, 200, { ...await health(), busy: Boolean(lease.active || lease.closing), encoder: local.encoder, hostId:local.hostId, appId:local.appId, width:1280, height:720, fps:30 });
    }
    if (req.method === 'POST' && pathname === '/demo/session') {
      await readJson(req);
      const status=await health();
      if(!status.ready) return reply(res,503,{error:status.error});
      try { return reply(res, 200, { token: lease.acquire(), hostId:local.hostId, appId:local.appId }); }
      catch { return reply(res, 409, { error:'已有手机连接，请先断开原会话。' }); }
    }
    if (req.method === 'POST' && ['/demo/heartbeat','/demo/end'].includes(pathname)) {
      const { token } = await readJson(req);
      if (!lease.owns(token)) return reply(res, 409, { error:'会话已结束，请重新连接。' });
      if (pathname.endsWith('heartbeat')) lease.touch(token);
      else await lease.release(token);
      return reply(res, 200, { ok:true });
    }
    if (req.method === 'GET' && ['/api/authenticate','/api/user','/api/role','/api/host','/api/apps'].includes(pathname)) {
      const response = await requestUpstream(`${upstream}${url.pathname}${url.search}`, { headers: adminHeaders() });
      res.writeHead(response.status, { 'content-type':response.headers['content-type'] || 'application/json', 'cache-control':'no-store' });
      return res.end(response.text);
    }
    if (req.method === 'POST' && pathname === '/demo/report') {
      const report = await readJson(req);
      if (!lease.owns(report.token)) return reply(res, 403, { error:'No session' });
      delete report.token;
      log(`CLIENT ${JSON.stringify(report).slice(0,2500)}`);
      return reply(res, 200, { ok:true });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await staticFile(req, res, pathname);
    reply(res, 404, { error:'Not found' });
  } catch (e) { log(e.message); if(!res.headersSent) reply(res, e.status || 500, { error: e.message });else res.destroy(); }
});
server.on('upgrade', (req, socket, head) => {
  let url;
  try{url=new URL(req.url,'http://localhost');}catch{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
  const token = url.searchParams.get('demo_token');
  if (url.pathname !== '/api/host/stream' || !sameOrigin(req) || !lease.owns(token)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  if(signalling.has(token)){socket.end('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');return;}
  signalling.set(token,socket);
  url.searchParams.delete('demo_token');
  const peer = net.connect(upstreamPort, '127.0.0.1');
  sockets.add(socket); sockets.add(peer);
  peer.on('connect', () => {
    if(!lease.owns(token)){socket.destroy();peer.destroy();return;}
    const headers = { ...req.headers, host:`127.0.0.1:${upstreamPort}`, authorization:`Bearer ${local.gatewayToken}` };
    delete headers.cookie;
    peer.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\n${Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (head.length) peer.write(head);
    socket.pipe(peer).pipe(socket);
  });
  const close = () => { socket.destroy(); peer.destroy(); sockets.delete(socket); sockets.delete(peer);if(signalling.get(token) === socket) signalling.delete(token); };
  socket.on('error', close); peer.on('error', close); socket.on('close', close); peer.on('close', close);
});
async function shutdown() {
  clearInterval(watchdog);
  if (lease.active) await lease.release(lease.active.token, 'host-shutdown').catch(e => log(e.message));
  for(const socket of sockets) socket.destroy();
  await new Promise(resolve=>server.close(resolve));
}
return {server,lease,shutdown};
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  let local;
  try{local=JSON.parse(await readFile(path.join(projectRoot,'local.json'),'utf8'));}
  catch{console.error('Run scripts/prepare.mjs and scripts/bootstrap.mjs first.');process.exit(1);}
  const {server,shutdown}=createDemoServer({local});
  const port=Number(process.env.PORT || 8080);
  server.listen(port,'0.0.0.0',()=>{
    console.log(`HTTP demo listening on port ${port}; host encoder: ${local.encoder}`);
    for(const info of Object.values(networkInterfaces()).flat()) if(info?.family === 'IPv4' && !info.internal) console.log(`Phone URL: http://${info.address}:${port}`);
  });
  const stop=()=>shutdown().finally(()=>process.exit(0));
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
