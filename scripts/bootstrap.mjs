import { readFile, writeFile } from 'node:fs/promises';
import { openSync, closeSync, existsSync } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '../lib/upstream.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = JSON.parse(await readFile(path.join(root,'local.json'),'utf8'));
const sun = path.join(root,local.sunshineDir), gateway = path.join(root,local.gatewayDir);
const conf = path.join(sun,'demo/sunshine.conf');
const procsFile = path.join(root,'runtime/processes.json');
let processes = {};
try { processes = JSON.parse(await readFile(procsFile,'utf8')); } catch {}
async function spawnService(name, executable, args, cwd) {
  const fd = openSync(path.join(root,`logs/${name}-console.log`),'a');
  const child = spawn(executable,args,{cwd,windowsHide:true,detached:true,stdio:['ignore',fd,fd]});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  processes[name] = {pid:child.pid,startedAt:new Date().toISOString()};
  child.unref(); closeSync(fd);
  await writeFile(procsFile,JSON.stringify(processes,null,2));
  console.log(`${name} started (PID ${child.pid})`);
}
async function waitFor(url, headers={}) {
  for(let i=0;i<45;i++){
    try {return await request(url,{headers,timeout:1500});}catch{}
    await new Promise(r=>setTimeout(r,1000));
  }
  throw new Error(`Service did not start: ${new URL(url).port}. See logs directory.`);
}
const sunBase = `http://127.0.0.1:${local.sunshinePort}`;
let sunReady = false;
try {await request(`${sunBase}/serverinfo`,{timeout:1000});sunReady=true;}catch{}
if(!sunReady){
  if(!existsSync(path.join(sun,'demo/state.json'))){
    await promisify(execFile)(path.join(sun,'sunshine.exe'),[conf,'--creds',local.sunshineUser,local.sunshinePassword],{cwd:sun,windowsHide:true});
  }
  await spawnService('sunshine',path.join(sun,'sunshine.exe'),[conf],sun);
}
await waitFor(`${sunBase}/serverinfo`);
const base=`http://127.0.0.1:${local.gatewayPort}`;
let gateReady=false;
try {await request(`${base}/` ,{timeout:1000});gateReady=true;}catch{}
if(!gateReady) await spawnService('gateway',path.join(gateway,'web-server.exe'),['--config-path',path.join(gateway,'server/config.json')],gateway);
await waitFor(`${base}/`);
const login=await request(`${base}/api/login`,{method:'POST',json:{name:local.gatewayUser,password:local.gatewayPassword}});
const cookies=login.headers['set-cookie'] || [];
const sessionCookie=cookies.find(c=>c.startsWith('mlSession='));
if(!sessionCookie) throw new Error('Gateway did not return its session token.');
local.gatewayToken=sessionCookie.split(';')[0].slice('mlSession='.length);
const headers={authorization:`Bearer ${local.gatewayToken}`};
let host;
if(local.hostId){try {host=(await request(`${base}/api/host?host_id=${local.hostId}`,{headers})).data.host;}catch{}}
if(!host){
  const listing=await request(`${base}/api/hosts`,{headers});
  const first=JSON.parse(listing.text.trim().split('\n')[0]);
  for(const item of first.hosts || []){
    const candidate=(await request(`${base}/api/host?host_id=${item.host_id}`,{headers})).data.host;
    if(candidate.address === '127.0.0.1' && candidate.http_port === local.sunshinePort){host=candidate;break;}
  }
}
if(!host) host=(await request(`${base}/api/host`,{method:'POST',headers,json:{address:'127.0.0.1',http_port:local.sunshinePort}})).data.host;
local.hostId=host.host_id;
await writeFile(path.join(root,'local.json'),JSON.stringify(local,null,2));
if(host.paired !== 'Paired'){
  const response=await fetch(`${base}/api/pair`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({host_id:local.hostId}),signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error(`Pair request failed: ${response.status}`);
  let pending=''; let paired=false;
  for await(const chunk of response.body){
    pending += new TextDecoder().decode(chunk);
    while(pending.includes('\n')){
      const end=pending.indexOf('\n'); const line=pending.slice(0,end); pending=pending.slice(end+1);
      if(!line.trim()) continue;
      const event=JSON.parse(line);
      if(event.Pin){
        const authorization='Basic '+Buffer.from(`${local.sunshineUser}:${local.sunshinePassword}`).toString('base64');
        let accepted=false;
        for(let attempt=0;attempt<12;attempt++){
          await new Promise(r=>setTimeout(r,250));
          const pinResult=await request(`https://127.0.0.1:${local.sunshineAdminPort}/api/pin`,{method:'POST',headers:{authorization,origin:`https://localhost:${local.sunshineAdminPort}`},json:{pin:event.Pin,name:'云游戏DEMO'}});
          if(pinResult.data?.status === true){accepted=true;break;}
        }
        if(!accepted) throw new Error('Sunshine did not accept a pending pairing PIN.');
      } else if(event.Paired){paired=true;host=event.Paired;}
      else if(event === 'PairError') throw new Error('Moonlight pairing failed.');
    }
  }
  if(!paired) throw new Error('Pairing did not complete.');
  console.log('Paired the local gateway with Sunshine.');
}
const apps=(await request(`${base}/api/apps?host_id=${local.hostId}`,{headers})).data.apps;
const desktop=apps.find(app=>app.title === 'Desktop');
if(!desktop) throw new Error('The dedicated Desktop app is missing.');
local.appId=desktop.app_id;
await writeFile(path.join(root,'local.json'),JSON.stringify(local,null,2));
console.log('Local host is ready. Starting HTTP entrypoint.');
try {await request('http://127.0.0.1:8080/demo/status',{timeout:1000});}
catch {await spawnService('http',process.execPath,[path.join(root,'server.mjs')],root);}
await waitFor('http://127.0.0.1:8080/demo/status');
console.log('Demo URL: http://127.0.0.1:8080');
