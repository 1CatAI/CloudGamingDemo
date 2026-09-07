import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ACTIONS,GameActionInput} from '../public/beamng-controls.js';
import {StreamControllerButton as buttons} from '../runtime/moonlight/package/static/api_bindings.js';
const neutral={buttonFlags:0,leftTrigger:0,rightTrigger:.8,leftStickX:.45,leftStickY:0,rightStickX:0,rightStickY:0};
function fixture(){
  const keys=[],callbacks=new Map();let next=0;
  const input=new GameActionInput({buttons,sendKey:(...event)=>keys.push(event),schedule:fn=>{const id=++next;callbacks.set(id,fn);return id;},cancel:id=>callbacks.delete(id)});
  return {input,keys,callbacks};
}
test('named gamepad actions match the installed BeamNG 0.39.4 inputmap',()=>{
  const expected={reset:'BUTTON_RIGHT',recover:'BUTTON_LEFT',camera:'BUTTON_Y',handbrake:'BUTTON_B',shiftUp:'BUTTON_A',shiftDown:'BUTTON_X',menu:'BUTTON_PLAY',map:'BUTTON_BACK'};
  for(const [id,button] of Object.entries(expected)) assert.equal(GAME_ACTIONS.find(a=>a.id === id).button,button);
});
test('handbrake and shift can coexist with steering and throttle',()=>{
  const {input}=fixture();input.press('handbrake','finger1');input.press('shiftUp','finger2');
  const state=input.merge(neutral);
  assert.equal(state.buttonFlags,buttons.BUTTON_B | buttons.BUTTON_A);
  assert.equal(state.rightTrigger,.8);assert.equal(state.leftStickX,.45);
  input.release('finger2');assert.equal(input.merge(neutral).buttonFlags,buttons.BUTTON_B);
  input.releaseAll();assert.deepEqual(input.merge(neutral),neutral);
});
test('two fingers holding the horn release it only after both are released',()=>{
  const {input,keys}=fixture();input.press('horn','one');input.press('horn','two');
  assert.deepEqual(keys,[[true,0x48,0]]);
  input.release('one');assert.equal(keys.length,1);
  input.release('two');assert.deepEqual(keys.at(-1),[false,0x48,0]);
});
test('disconnect releases held keys and cancels pending tap timers',()=>{
  const {input,keys,callbacks}=fixture();
  input.press('ignition','finger');input.pulse('pause');input.pulse('reset');
  assert.equal(callbacks.size,2);
  input.releaseAll();assert.equal(callbacks.size,0);assert.equal(input.owners.size,0);
  assert.ok(keys.some(([down,key])=>!down && key===0x56));
  assert.ok(keys.some(([down,key])=>!down && key===0x4a));
  assert.equal(input.merge(neutral).buttonFlags,0);
});
test('a failed timer cannot leave a tap or keyboard key held down',()=>{
  const keys=[];
  const input=new GameActionInput({buttons,sendKey:(...args)=>keys.push(args),schedule:()=>{throw new TypeError('Illegal invocation');}});
  assert.throws(()=>input.pulse('pause'),/Illegal invocation/);
  assert.deepEqual(keys,[[true,0x4a,0],[false,0x4a,0]]);
  assert.equal(input.owners.size,0);assert.equal(input.timers.size,0);
  assert.throws(()=>input.pulse('reset'),/Illegal invocation/);
  assert.equal(input.merge(neutral).buttonFlags,0);
});
test('rapid double taps produce two presses with a neutral interval',()=>{
 const {input,callbacks}=fixture();
 const fireNext=()=>{const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn();};
 input.pulse('shiftUp');input.pulse('shiftUp');
 assert.equal(input.merge(neutral).buttonFlags,buttons.BUTTON_A);
 fireNext();assert.equal(input.merge(neutral).buttonFlags,0);
 fireNext();assert.equal(input.merge(neutral).buttonFlags,buttons.BUTTON_A);
 fireNext();assert.equal(input.merge(neutral).buttonFlags,0);
 assert.equal(input.tapQueues.size,0);
});
test('disconnect cancels queued repeat taps as well as the current press',()=>{
 const {input,callbacks}=fixture();input.pulse('camera');input.pulse('camera');input.releaseAll();
 assert.equal(callbacks.size,0);assert.equal(input.tapQueues.size,0);assert.equal(input.merge(neutral).buttonFlags,0);
});
