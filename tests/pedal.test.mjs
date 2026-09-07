import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../public/vendor/universal-touch-gamepad.js',import.meta.url),'utf8');
const start=source.indexOf('function updateAnalogTriggerVisuals(');
const finish=source.indexOf('    function createSettingsIcon()',start);
const part=source.slice(start,finish).trim();
const body=part.slice(part.indexOf('{')+1,part.lastIndexOf('}'));
test('racing pedal increases upwards and releases to zero',()=>{
  let output;
  const track={element:{getBoundingClientRect:()=>({top:100,height:150})},activeTouchId:1,config:{direction:'up'},fillElement:{style:{}}};
  const run=new Function('buttonIndex','currentClientY','isActive','analogTriggersToTrack','updateGamepadButton',body);
  const sample=(y,active=true)=>{run(7,y,active,{7:track},(_index,_pressed,value)=>{output=value;});return output;};
  assert.equal(sample(250),0); assert.equal(sample(175),.5); assert.equal(sample(100),1);
  assert.equal(sample(0),1); assert.equal(sample(300),0);
  assert.equal(sample(100,false),0);
  track.activeTouchId=null; assert.equal(sample(100),0);
});
