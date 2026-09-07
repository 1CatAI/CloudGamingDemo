import test from 'node:test';
import assert from 'node:assert/strict';
import {BITRATE_STEPS,bitrateChoice,bitratePosition} from '../public/bitrate-slider.js';
import {presetSettings} from '../public/presets.js';
test('slider positions map to the actual bitrate rather than the tick index',()=>{
  assert.equal(bitrateChoice(0),'auto');
  assert.equal(bitrateChoice(BITRATE_STEPS.length-1),'300000');
  assert.equal(presetSettings('2756x1268p120',bitrateChoice(0)).bitrate,80000);
  assert.equal(presetSettings('2756x1268p120',bitrateChoice(13)).bitrate,300000);
  assert.equal(bitrateChoice(bitratePosition('100000')),'100000');
});
test('invalid saved positions return to automatic recommendations',()=>{
  assert.equal(bitrateChoice(-1),'auto');assert.equal(bitrateChoice(100),'auto');
  assert.equal(bitrateChoice(2.5),'auto');assert.equal(bitratePosition(null),0);
});
