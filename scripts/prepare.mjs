import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchMediaFeatures } from './patch-media.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const encoderArg = process.argv[2] || 'nvenc';
const encoder = {nvidia:'nvenc',amd:'amdvce',nvenc:'nvenc',amdvce:'amdvce'}[encoderArg];
if (!encoder) throw new Error('Encoder must be nvidia or amd.');
const sun = path.join(root,'runtime/sunshine/Sunshine');
const gateway = path.join(root,'runtime/moonlight/package');
for (const p of [path.join(sun,'demo/credentials'),path.join(gateway,'server'),path.join(root,'logs')]) await mkdir(p,{recursive:true});
if (!existsSync(path.join(gateway,'web-server.exe')) || !existsSync(path.join(sun,'sunshine.exe'))) throw new Error('Extract official archives before preparation.');
let local = {};
try { local = JSON.parse(await readFile(path.join(root,'local.json'),'utf8')); } catch {}
if(local.encoder && local.encoder !== encoder){
  let running=false;
  try{running=(await fetch('http://127.0.0.1:8080/demo/status',{signal:AbortSignal.timeout(1500)})).ok;}catch{}
  if(running) throw new Error('Stop-Demo.ps1 must be run before changing the active encoder. No configuration was changed.');
}
Object.assign(local, {
  encoder, sunshineDir:path.relative(root,sun), gatewayDir:path.relative(root,gateway),
  staticPath:path.relative(root,path.join(gateway,'static')), gatewayPort:8091,
  sunshinePort:48989, sunshineAdminPort:48990,
  sunshineUser:local.sunshineUser || 'demo-host', sunshinePassword:local.sunshinePassword || randomBytes(24).toString('hex'),
  gatewayUser:local.gatewayUser || 'demo-local', gatewayPassword:local.gatewayPassword || randomBytes(24).toString('hex')
});
await writeFile(path.join(root,'local.json'),JSON.stringify(local,null,2));
const abs = relative => path.join(sun,'demo',relative).replaceAll('\\','/');
const config = {
  sunshine_name:'云游戏DEMO', port:48989, bind_address:'127.0.0.1', address_family:'ipv4',
  origin_web_ui_allowed:'pc', upnp:'disabled', encoder, hevc_mode:2, av1_mode:0,
  gamepad:'x360', controller:'enabled', keyboard:'enabled', mouse:'enabled',
  dd_configuration_option:'disabled', capture:'ddx',
  file_apps:abs('apps.json'), file_state:abs('state.json'), credentials_file:abs('state.json'),
  pkey:abs('credentials/cakey.pem'), cert:abs('credentials/cacert.pem'),
  log_path:path.join(root,'logs/sunshine.log').replaceAll('\\','/'),
  min_log_level:2
};
await writeFile(path.join(sun,'demo/sunshine.conf'),Object.entries(config).map(([k,v])=>`${k} = ${v}`).join('\n')+'\n');
await writeFile(path.join(sun,'demo/apps.json'),JSON.stringify({env:{},apps:[{name:'Desktop',cmd:'', 'image-path':'desktop.png'}]},null,2));
await writeFile(path.join(gateway,'server/config.json'),JSON.stringify({
  streamer_path:path.join(gateway,'streamer.exe'),
  data_storage:{type:'json',path:path.join(gateway,'server/data.json'),session_expiration_check_interval:{secs:300,nanos:0}},
  web_server:{bind_address:'127.0.0.1:8091',certificate:null,url_path_prefix:'',session_cookie_secure:false,session_cookie_expiration:{secs:2592000,nanos:0},first_login_create_admin:true,first_login_assign_global_hosts:true,default_user_id:null,default_role_id:null,forwarded_header:null},
  webrtc:{ice_servers:[],port_range:{min:40000,max:40010},include_loopback_candidates:true,network_types:['udp4']},
  log:{level_filter:'info',file_path:path.join(root,'logs/moonlight.log'),dev_venator:false}
},null,2));

async function patch(relative, changes) {
  const file = path.join(gateway,'static',relative);
  let text = (await readFile(file,'utf8')).replaceAll('\r\n','\n');
  const marker = '// BeamNG LAN Demo patch v1';
  if (text.startsWith(marker)) return;
  for (const [before,after] of changes) {
    if (!text.includes(before)) throw new Error(`Unsupported upstream contents: ${relative}: ${before.slice(0,60)}`);
    text = text.replace(before,after);
  }
  await writeFile(file,marker+'\n'+text);
}
await patch('stream/index.js',[
  ['new WebSocket(`${wsApiHost}/host/stream`)','new WebSocket(`${wsApiHost}/host/stream?demo_token=${encodeURIComponent(window.__DEMO_TOKEN__ || "")}`)'],
  ['videoCodecHint.H265_MAIN10 = true;','videoCodecHint.H265_MAIN10 = false;'],
  ['videoCodecHint.H265_REXT8_444 = true;','videoCodecHint.H265_REXT8_444 = false;'],
  ['videoCodecHint.H265_REXT10_444 = true;','videoCodecHint.H265_REXT10_444 = false;']
]);
await patch('stream/input.js',[
  ['this.sendControllerAdd(this.gamepads.length - 1, SUPPORTED_BUTTONS, capabilities);','this.sendControllerAdd(id, SUPPORTED_BUTTONS, capabilities);'],
  ['this.sendControllerRemove(id);','this.sendControllerRemove(index);'],
  ['if (oldGamepadState == null) {\n                return;','if (oldGamepadState == null) {\n                continue;']
]);
await patch('stream/gamepad.js',[
  ['StreamControllerButton.BUTTON_B,\n    StreamControllerButton.BUTTON_A,\n    StreamControllerButton.BUTTON_Y,\n    StreamControllerButton.BUTTON_X,','StreamControllerButton.BUTTON_A,\n    StreamControllerButton.BUTTON_B,\n    StreamControllerButton.BUTTON_X,\n    StreamControllerButton.BUTTON_Y,']
]);
await patch('stream/video/video_element.js',[
  ['supportedVideoCodecs: supported ? detectCodecs() : emptyVideoCodecs()','supportedVideoCodecs: supported ? maybeVideoCodecs() : emptyVideoCodecs()']
]);
await patch('resources/index.js',[
  ['import { buildUrl } from "../config_.js";', 'import { buildUrl as buildBaseUrl } from "../config_.js";\nconst buildUrl = path => buildBaseUrl(path.replace(/^\\/resources\\//, "/upstream/resources/"));']
]);
await writeFile(path.join(gateway,'static/config.js'),'export default { path_prefix: "" };\n');
await patchMediaFeatures(path.join(gateway,'static'));
await copyFile(path.join(root,'vendor/moonlight-web-stream-2.10.0/LICENSE'),path.join(root,'LICENSE'));
console.log(`Prepared ${encoder === 'nvenc' ? 'NVIDIA NVENC' : 'AMD AMF'} H.265 / AV1 host and HTTP frontend.`);
