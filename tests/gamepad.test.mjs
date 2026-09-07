import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractGamepadState, emptyGamepadState, SUPPORTED_BUTTONS } from '../runtime/moonlight/package/static/stream/gamepad.js';
import { StreamControllerButton } from '../runtime/moonlight/package/static/api_bindings.js';

test('touch axes, simultaneous throttle/brake and standard face buttons retain their values',()=>{
  const pad={axes:[0.25,-0.75,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};
  pad.buttons[0]={pressed:true,value:1}; pad.buttons[6]={pressed:true,value:0.35}; pad.buttons[7]={pressed:true,value:0.8};
  const result=extractGamepadState(pad,{invertAB:false,invertXY:false});
  assert.equal(result.buttonFlags,StreamControllerButton.BUTTON_A);
  assert.equal(result.leftTrigger,.35); assert.equal(result.rightTrigger,.8);
  assert.equal(result.leftStickX,.25); assert.equal(result.leftStickY,-.75);
});

const source=await readFile(new URL('../runtime/moonlight/package/static/stream/input.js',import.meta.url),'utf8');
function method(name,next){
  const start=source.indexOf(`    ${name}`);
  const stop=source.indexOf(`    ${next}`,start+1);
  assert.ok(start>=0 && stop>start);
  const part=source.slice(start,stop).trim();
  return part.slice(part.indexOf('{')+1,part.lastIndexOf('}'));
}
test('reconnecting into a gap registers the allocated slot',()=>{
  const run=new Function('gamepad','emptyGamepadState','SUPPORTED_BUTTONS',method('onGamepadConnect(gamepad)','onGamepadDisconnect(event)'));
  let sent;
  const ctx={connected:true,controllers:{},gamepads:[null,{gamepadIndex:1}],gamepadRumbleInterval:1,gamepadRumbleCurrent:[],collectActuators:()=>[],sendControllerAdd:id=>{sent=id;}};
  run.call(ctx,{index:0,mapping:'standard'},emptyGamepadState,SUPPORTED_BUTTONS);
  assert.equal(sent,0);
});
test('disconnect uses stream slot rather than browser index',()=>{
  const run=new Function('event',method('onGamepadDisconnect(event)','onGamepadUpdate()'));
  let sent;
  run.call({gamepads:[{gamepadIndex:2}],sendControllerRemove:id=>{sent=id;}},{gamepad:{index:2}});
  assert.equal(sent,0);
});
test('an empty slot does not stop subsequent controller updates',()=>{
  const run=new Function('navigator','extractGamepadState',method('onGamepadUpdate()','onControllerData(data)'));
  const sent=[];
  run.call({config:{controllerConfig:{sendIntervalOverride:null}},gamepads:[null,{gamepadIndex:1,oldState:{}}],sendController:id=>sent.push(id)}, {getGamepads:()=>[null,{mapping:'standard'}]},()=>emptyGamepadState());
  assert.deepEqual(sent,[1]);
});
