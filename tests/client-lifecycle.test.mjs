import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {GameActionInput,GAME_ACTIONS} from '../public/beamng-controls.js';
import {STREAM_PRESETS,MAX_BITRATE_KBPS,getPreset,presetSettings} from '../public/presets.js';
import {VIDEO_CODECS,getCodec,browserSupportsCodec} from '../public/codecs.js';
import {VideoLatencyEstimator,latencyLabel,formatMs} from '../public/latency.js';
import {BITRATE_STEPS,bitrateChoice,bitratePosition} from '../public/bitrate-slider.js';
const source=(await readFile(new URL('../public/demo.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
function fixture(){
 const elements=new Map(), ended=[];
 function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},style:{setProperty(){}},listeners:{},classList:{add(){},remove(){},toggle(){return false;}},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},appendChild(){},querySelector(){return null;},requestFullscreen:async()=>{}};}
 const document={hidden:false,visibilityState:'visible',body:element(),listeners:{},createElement:element,getElementById(id){if(!elements.has(id)) elements.set(id,element());return elements.get(id);},addEventListener(name,fn){this.listeners[name]=fn;}};
 class MockStream{
  constructor(){this.listeners=new Set();this.transport={close:async()=>{}};this.ws={close(){}};}
  addInfoListener(fn){this.listeners.add(fn);} removeInfoListener(fn){this.listeners.delete(fn);}
  mount(){} unmount(){} async stop(){return true;}
  getStats(){return {setEnabled(){}};}
  getInput(){return {sendController(){},sendControllerAdd(){},sendKey(){}};}
  getVideoRenderer(){return {cleanup(){},onUserInteraction(){}};}
  getAudioPlayer(){return {cleanup(){},onUserInteraction(){}};}
 }
 let serial=0,resolveSession=null;
 const response=data=>({ok:true,json:async()=>data});
 const sandbox={document,console,GameActionInput,GAME_ACTIONS,STREAM_PRESETS,MAX_BITRATE_KBPS,getPreset,presetSettings,VIDEO_CODECS,getCodec,browserSupportsCodec,VideoLatencyEstimator,latencyLabel,formatMs,BITRATE_STEPS,bitrateChoice,bitratePosition,Stream:MockStream,
  StreamControllerButton:{},SUPPORTED_BUTTONS:0,emptyGamepadState:()=>({buttonFlags:0}),extractGamepadState:()=>({buttonFlags:0}),DEFAULT_SETTINGS:{},
  location:{origin:'http://test'},navigator:{userAgent:'test',sendBeacon(){}},localStorage:{getItem:()=>null,setItem(){}},
  AbortSignal,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},addEventListener(){},postMessage(){},
  RTCPeerConnection:class{},RTCRtpReceiver:{getCapabilities:()=>({codecs:[{mimeType:'video/H265'}]})},
  fetch:async(path,options)=>{
   if(path === '/demo/session'){
    const session={token:`token-${++serial}`,hostId:1,appId:2};
    if(resolveSession) return await new Promise(r=>resolveSession(()=>r(response(session))));
    return response(session);
   }
   if(path === '/demo/end') ended.push(JSON.parse(options.body).token);
   return response({ready:true,busy:false,encoder:'nvenc'});
  }
 };
 sandbox.window=sandbox;
 vm.runInNewContext(source+'\nglobalThis.audit={start,end,state:()=>({stream,token,starting,stopping})};',sandbox);
 return {audit:sandbox.audit,document,ended,deferSession:setter=>{resolveSession=setter;}};
}
test('a late fatal callback from an old stream cannot disconnect the new stream',async()=>{
 const f=fixture();await f.audit.start();const old=f.audit.state().stream;
 const late=[...old.listeners][0];await f.audit.end();await f.audit.start();const current=f.audit.state().stream;
 late({detail:{type:'addDebugLine',additional:{type:'fatal'},line:'old transport failed'}});
 assert.equal(f.audit.state().stream,current);assert.equal(old.listeners.size,0);
 await f.audit.end();
});
test('cancelling during session acquisition releases the late lease instead of opening a stream',async()=>{
 const f=fixture();let deliver;
 f.deferSession(resolve=>{deliver=resolve;});
 const pending=f.audit.start();assert.equal(f.audit.state().starting,true);
 await f.audit.end();deliver();await pending;
 assert.equal(f.audit.state().stream,null);assert.equal(f.audit.state().token,null);
 assert.deepEqual(f.ended,['token-1']);
});
