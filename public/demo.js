import { Stream } from '/upstream/stream/index.js';
import { extractGamepadState, emptyGamepadState, SUPPORTED_BUTTONS } from '/upstream/stream/gamepad.js';
import DEFAULT_SETTINGS from '/upstream/default_settings.js';
import { StreamControllerButton } from '/upstream/api_bindings.js';
import { STREAM_PRESETS, MAX_BITRATE_KBPS, getPreset, presetSettings } from './presets.js';
import { GAME_ACTIONS, GameActionInput } from './beamng-controls.js';
import { VIDEO_CODECS, getCodec, browserSupportsCodec } from './codecs.js';
import { VideoLatencyEstimator, latencyLabel, formatMs } from './latency.js';
import { BITRATE_STEPS, bitrateChoice, bitratePosition } from './bitrate-slider.js';

const $ = id => document.getElementById(id);
try { localStorage.setItem('universalTouchGamepad_currentProfile','racing'); } catch {}
let stream = null, token = null, connected = false, stopping = false;
let heartbeatTimer, inputTimer, statsTimer, connectTimer;
let reportCount = 0;
let activePreset = null;
let activeCodec=null;
const latencyEstimator=new VideoLatencyEstimator();
let starting=false, generation=0, streamInfoListener=null;
let lastHealthError=null;
const actionButtons=[];
const actionInput=new GameActionInput({
  buttons:StreamControllerButton,
  enabled:()=>Boolean(stream && connected && !stopping),
  sendKey:(down,key,modifiers)=>{try{stream?.getInput().sendKey(down,key,modifiers);}catch{}},
  onActivate:action=>{
    if(action.clearDriving){
      window.demoResetTouch?.();
      stream?.getInput().sendController(0,emptyGamepadState());
    }
  }
});
const permissions = {
  allow_add_hosts:false, maximum_bitrate_kbps:MAX_BITRATE_KBPS,
  allow_codec_h264:false, allow_codec_h265:true, allow_codec_av1:true,
  allow_hdr:false, allow_transport_webrtc:true, allow_transport_websockets:false
};
const api = { host_url:location.origin + '/api', bearer:null, user:null, role:null };
async function post(path, body, timeout=6000) {
  const response = await fetch(path, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body),signal:AbortSignal.timeout(timeout) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function message(text) { $('state').textContent = text; }
function error(text) { $('error').hidden = !text; $('error').textContent = text || ''; }
function toggleTouch(visible) {
  window.postMessage({type:'TOUCH_GAMEPAD_SETUP',payload:{targetDivId:'touch-gamepad-host',initialProfileName:'racing',visible}}, location.origin);
  if (!visible) window.postMessage({type:'TOUCH_GAMEPAD_VISIBILITY',payload:{visible:false}},location.origin);
}
function zeroInput() {
  actionInput.releaseAll();
  for(const {button} of actionButtons) button.classList.remove('is-down');
  window.demoResetTouch?.();
  if (stream && connected) {
    try { stream.getInput().sendController(0, emptyGamepadState()); } catch {}
  }
}
function setupActions() {
  for(const action of GAME_ACTIONS){
    const button=document.createElement('button');
    button.type='button'; button.textContent=action.label;
    button.dataset.action=action.id;
    button.title=action.hint || action.label;
    button.setAttribute('aria-label',action.hint ? `${action.label}：${action.hint}` : action.label);
    const ownerFor=e=>`${action.id}:pointer:${e.pointerId}`;
    if(action.mode === 'hold'){
      button.addEventListener('pointerdown',e=>{
        if(e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault(); e.stopPropagation();
        if(actionInput.press(action.id,ownerFor(e))){button.setPointerCapture(e.pointerId);button.classList.add('is-down');}
      });
      const release=e=>{e.stopPropagation();actionInput.release(ownerFor(e));button.classList.remove('is-down');};
      button.addEventListener('pointerup',release);
      button.addEventListener('pointercancel',release);
      button.addEventListener('lostpointercapture',release);
      button.addEventListener('keydown',e=>{
        if((e.key === ' ' || e.key === 'Enter') && !e.repeat){e.preventDefault();actionInput.press(action.id,`${action.id}:keyboard`);button.classList.add('is-down');}
      });
      button.addEventListener('keyup',e=>{
        if(e.key === ' ' || e.key === 'Enter'){e.preventDefault();actionInput.release(`${action.id}:keyboard`);button.classList.remove('is-down');}
      });
      button.addEventListener('click',e=>{e.stopPropagation();if(e.detail === 0 && !actionInput.active(action.id)) actionInput.pulse(action.id);});
    }else{
      button.addEventListener('click',e=>{e.stopPropagation();actionInput.pulse(action.id);});
    }
    button.addEventListener('contextmenu',e=>e.preventDefault());
    $(`actions-${action.group}`).appendChild(button);
    actionButtons.push({button,action});
  }
}
function presetHint(){
  const preset=getPreset($('preset').value);
  if(!token) $('stats').textContent=`${preset.label} · ${getCodec($('codec').value).label}`;
  const choice=bitrateChoice($('bitrate').value);
  const selected=presetSettings(preset.id,choice);
  const label=choice==='auto'?`自动 · ${selected.bitrate/1000} Mbps`:`${selected.bitrate/1000} Mbps`;
  $('bitrate-value').textContent=label;
  $('bitrate').setAttribute('aria-valuetext',label);
  $('bitrate').style.setProperty('--range-progress',`${Number($('bitrate').value)/(BITRATE_STEPS.length-1)*100}%`);
  $('preset-hint').textContent=`${choice==='auto'?'推荐':'已选'} ${selected.bitrate/1000} Mbps · 重连后应用`;
}
function renderLatency(sample){
  $('latency').textContent=latencyLabel(sample);
  for(const [id,key] of [['lat-host','hostMs'],['lat-bridge','bridgeMs'],['lat-network','networkMs'],['lat-buffer','receiveOtherMs'],['lat-decode','decodeMs']]) $(id).textContent=formatMs(sample[key]);
  $('lat-total').textContent=formatMs(sample.totalMs);
  $('lat-rtt').textContent=formatMs(sample.browserRttMs);
  $('lat-local-rtt').textContent=formatMs(sample.localRttMs);
  $('lat-missing').textContent=sample.missing?.length?`未取得：${sample.missing.join('、')}`:sample.reason==='no-frames'?'当前没有新画面，等待恢复采样。':'';
}
async function unlockAudio() {
  if (!stream) return;
  const source=stream;
  stream.getVideoRenderer()?.onUserInteraction();
  stream.getAudioPlayer()?.onUserInteraction();
  const audio = $('screen').querySelector('audio');
  if (audio) {
    audio.muted = false;
    try { await audio.play(); if(stream === source) $('sound').hidden = true; }
    catch { if(stream === source) $('sound').hidden = false; }
  }
}
async function fullscreen() {
  try {
    if (!document.fullscreenElement) await document.body.requestFullscreen({navigationUI:'hide'});
    else await document.exitFullscreen();
  } catch {}
}
async function refreshStatus() {
  if (token || stopping || starting) return;
  const epoch=generation;
  try {
    const response = await fetch('/demo/status',{signal:AbortSignal.timeout(2500)});
    const status = await response.json();
    if(epoch !== generation || token || stopping || starting) return;
    $('encoder').textContent = status.encoder === 'nvenc' ? 'NVIDIA NVENC' : status.encoder === 'amdvce' ? 'AMD AMF' : status.encoder;
    $('start').disabled = !status.ready || status.busy;
    message(status.busy ? '主机使用中' : status.ready ? '主机就绪' : '主机尚未就绪');
    if(status.error){error(status.error);lastHealthError=status.error;}
    else if(lastHealthError){if($('error').textContent === lastHealthError) error('');lastHealthError=null;}
  } catch { if(epoch === generation && !token && !starting && !stopping){$('start').disabled = true; message('无法连接主机');} }
}
async function start() {
  if (stream || token || stopping || starting) return;
  starting=true;
  const attempt=++generation;
  error(''); $('start').disabled = true;
  try {
  if (!window.RTCPeerConnection || !window.RTCRtpReceiver) throw new Error('当前浏览器没有可用的 WebRTC 接收接口。');
  const requestedCodec=getCodec($('codec').value);
  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!browserSupportsCodec(caps,requestedCodec.id)) {
    throw new Error(`浏览器未报告 ${requestedCodec.label} 接收能力，请更换编码格式。`);
  }
  if (!document.fullscreenElement) document.body.requestFullscreen?.({navigationUI:'hide'}).catch(()=>{});
    const session = await post('/demo/session', {});
    if(attempt !== generation || document.hidden){
      await post('/demo/end',{token:session.token}).catch(()=>{});return;
    }
    token = session.token;
    window.__DEMO_TOKEN__ = token;
    let heartbeatInFlight=false;
    heartbeatTimer = setInterval(()=>{
      if (!token || heartbeatInFlight || attempt !== generation) return;
      const sentToken=token;
      heartbeatInFlight=true;
      post('/demo/heartbeat',{token:sentToken},2200).catch(e=>{if(token === sentToken && attempt === generation) end(e.message);}).finally(()=>{heartbeatInFlight=false;});
    }, 800);
    const settings = {
      ...DEFAULT_SETTINGS, ...presetSettings($('preset').value,bitrateChoice($('bitrate').value)), videoCodec:requestedCodec.id,
      dataTransport:'webrtc', forceVideoElementRenderer:true, canvasRenderer:false,
      videoFrameQueueSize:2, hdr:false, playAudioLocal:true, controllerConfig:{invertAB:false,invertXY:false,sendIntervalOverride:60}
    };
    activePreset=getPreset($('preset').value);
    activeCodec=requestedCodec;
    latencyEstimator.reset();
    renderLatency({reason:'sampling'});
    stream = new Stream(api, session.hostId, session.appId, settings, [activePreset.width,activePreset.height], permissions);
    const ownedStream=stream;
    streamInfoListener=event=>{if(stream === ownedStream && attempt === generation && !stopping) onInfo(event);};
    stream.addInfoListener(streamInfoListener);
    stream.mount($('screen'));
    stream.getStats().setEnabled(true);
    $('hint').textContent = '正在建立视频和控制连接…';
    message('正在连接'); $('disconnect').hidden = false;
    connectTimer = setTimeout(()=>end('连接超时。请检查主机日志与 Windows 防火墙。'), 25000);
  } catch (e) { if(attempt === generation) await end(e.message); }
  finally { if(attempt === generation) starting=false; }
}
function onInfo(event) {
  const info = event.detail;
  if (info.type === 'videoReady' && stream && !connected) {
    clearTimeout(connectTimer);
    connected = true;
    stream.getInput().sendControllerAdd(0, SUPPORTED_BUTTONS, 0);
    toggleTouch(true);
    document.body.classList.add('playing');
    $('game-controls').hidden=false;
    $('latency').hidden=false;
    $('keys').hidden=false;
    $('welcome').hidden = true;
    message('已连接');
    unlockAudio();
    inputTimer = setInterval(()=>{
      if (!connected || document.visibilityState !== 'visible') return;
      const pad = window.demoTouchState?.();
      const state = pad?.connected ? extractGamepadState(pad, {invertAB:false,invertXY:false}) : emptyGamepadState();
      stream.getInput().sendController(0, actionInput.merge(state));
      for(const {button,action} of actionButtons) button.classList.toggle('is-down',actionInput.active(action.id));
    }, 1000 / 60);
    statsTimer = setInterval(updateStats,1000);
    updateStats();
  } else if (info.type === 'addDebugLine') {
    if (info.additional?.type === 'fatal' && !stopping) end(info.line);
    if (/error|fail|non supported/i.test(info.line)) console.warn(info.line);
  }
}
async function updateStats() {
  if (!stream || !token) return;
  const sampledStream=stream, sampledToken=token;
  try {
    const stats = await sampledStream.transport?.peer?.getStats();
    if(stream !== sampledStream || token !== sampledToken) return;
    if (!stats) return;
    const latency=latencyEstimator.sample(stats,sampledStream.getStats().getCurrentStats(),performance.now());
    renderLatency(latency);
    for (const stat of stats.values()) {
      if (stat.type !== 'inbound-rtp' || (stat.kind || stat.mediaType) !== 'video') continue;
      const codec = stats.get(stat.codecId)?.mimeType || '';
      if (codec && codec.toLowerCase() !== activeCodec?.mime) { await end(`实际视频未使用 ${activeCodec?.label || '所选编码'}，会话已停止。`); return; }
      const width = stat.frameWidth, height = stat.frameHeight;
      $('stats').textContent = `${width || '—'}×${height || '—'} / ${Math.round(stat.framesPerSecond || 0)} FPS · ${codec ? activeCodec.label : '核验编码中'}`;
      if (++reportCount % 5 === 1) post('/demo/report',{token,preset:activePreset?.id,selectedCodec:activeCodec?.id,origin:location.origin,browser:navigator.userAgent,codec,width,height,fps:stat.framesPerSecond,framesDecoded:stat.framesDecoded,framesDropped:stat.framesDropped,decoder:stat.decoderImplementation,latency}).catch(()=>{});
    }
  } catch {}
}
async function end(reason = '') {
  if (stopping) return;
  stopping = true;
  generation++;starting=false;
  clearInterval(heartbeatTimer); clearInterval(inputTimer); clearInterval(statsTimer); clearTimeout(connectTimer);
  zeroInput();
  const oldToken = token, oldStream = stream;
  token = null; stream = null; connected = false; window.__DEMO_TOKEN__ = '';
  toggleTouch(false);
  if (oldStream) {
    if(streamInfoListener) oldStream.removeInfoListener(streamInfoListener);
    streamInfoListener=null;
    oldStream.getStats().setEnabled(false);
    try { await oldStream.stop(); } catch {}
    try { await oldStream.transport?.close(); } catch {}
    try { oldStream.ws?.close(); } catch {}
    try{oldStream.getVideoRenderer()?.cleanup();}catch{}
    try{oldStream.getAudioPlayer()?.cleanup();}catch{}
    try { oldStream.unmount($('screen')); } catch {}
  }
  if (oldToken) try { await post('/demo/end',{token:oldToken}); } catch {}
  document.body.classList.remove('playing');
  $('game-controls').hidden=true;
  $('latency').hidden=true;$('latency-panel').hidden=true;$('latency').setAttribute('aria-expanded','false');
  latencyEstimator.reset();
  document.body.classList.remove('show-extra-keys');
  $('keys').hidden=true; $('keys').setAttribute('aria-pressed','false');
  $('keys').textContent='按键';
  $('welcome').hidden = false; $('disconnect').hidden = true; $('sound').hidden = true;
  $('hint').textContent = '在电脑上打开游戏，然后连接。';
  activePreset=null;activeCodec=null;
  presetHint();
  error(reason);
  message('已断开');
  stopping = false;
  refreshStatus();
}
function leavePage() {
  zeroInput();
  if (token) navigator.sendBeacon('/demo/end', new Blob([JSON.stringify({token})],{type:'application/json'}));
}
$('start').addEventListener('click',start);
$('disconnect').addEventListener('click',()=>end());
$('fullscreen').addEventListener('click',fullscreen);
$('sound').addEventListener('click',unlockAudio);
$('codec').addEventListener('change',()=>{
  try{localStorage.setItem('cloud-demo-codec',$('codec').value);}catch{}
  presetHint();
});
$('latency').addEventListener('click',()=>{
  const open=$('latency-panel').hidden;
  $('latency-panel').hidden=!open;$('latency').setAttribute('aria-expanded',String(open));
});
$('preset').addEventListener('change',()=>{
  try{localStorage.setItem('beamng-demo-preset',$('preset').value);}catch{}
  presetHint();
});
$('bitrate').addEventListener('input',presetHint);
$('bitrate').addEventListener('change',()=>{
  try{localStorage.setItem('cloud-demo-bitrate',bitrateChoice($('bitrate').value));}catch{}
  presetHint();
});
$('keys').addEventListener('click',()=>{
  zeroInput();
  const visible=document.body.classList.toggle('show-extra-keys');
  $('keys').setAttribute('aria-pressed',String(visible));
  $('keys').textContent=visible?'收起按键':'按键';
});
document.addEventListener('pointerdown',()=>{if(connected) unlockAudio();},{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden && (token || starting)){leavePage();end('已暂停连接，点击连接主机继续。');}});
window.addEventListener('blur',zeroInput);
window.addEventListener('pagehide',leavePage);
window.addEventListener('resize',zeroInput);
window.addEventListener('error',event=>error(event.message));
window.addEventListener('unhandledrejection',event=>{error(String(event.reason?.message || event.reason));});
for(const preset of STREAM_PRESETS){
  const option=document.createElement('option');option.value=preset.id;option.textContent=preset.label;$('preset').appendChild(option);
}
try{$('preset').value=getPreset(localStorage.getItem('beamng-demo-preset')).id;}catch{}
for(const codec of VIDEO_CODECS){const option=document.createElement('option');option.value=codec.id;option.textContent=codec.label;$('codec').appendChild(option);}
try{$('codec').value=getCodec(localStorage.getItem('cloud-demo-codec')).id;}catch{}
$('bitrate').max=String(BITRATE_STEPS.length-1);
try{$('bitrate').value=String(bitratePosition(localStorage.getItem('cloud-demo-bitrate')));}catch{}
for(let index=0;index<BITRATE_STEPS.length;index++){const tick=document.createElement('span');$('bitrate-ticks').appendChild(tick);}
setupActions();presetHint();
refreshStatus(); setInterval(refreshStatus,5000);
