import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STREAM_PRESETS,getPreset,presetSettings} from '../public/presets.js';
test('each resolution provides 30/60/120 fps presets',()=>{
  assert.deepEqual(STREAM_PRESETS.map(p=>[p.id,p.width,p.height,p.fps]),[
    ['720p30',1280,720,30],['720p60',1280,720,60],['720p120',1280,720,120],
    ['1080p30',1920,1080,30],['1080p60',1920,1080,60],['1080p120',1920,1080,120],
    ['2756x1268p30',2756,1268,30],['2756x1268p60',2756,1268,60],['2756x1268p120',2756,1268,120]
  ]);
  assert.deepEqual(presetSettings('1080p60'),{videoSize:'1080p',fps:60,bitrate:20000});
  assert.deepEqual(presetSettings('720p60','15000'),{videoSize:'720p',fps:60,bitrate:15000});
  assert.equal(presetSettings('1080p30','auto').bitrate,12000);
});
test('custom dimensions and 300 Mbps survive conversion to stream settings',()=>{
  assert.deepEqual(presetSettings('2756x1268p120','300000'),{
    videoSize:'custom',fps:120,bitrate:300000,videoSizeCustom:{width:2756,height:1268}
  });
  assert.equal(presetSettings('2756x1268p120','300001').bitrate,80000);
  assert.equal(presetSettings('2756x1268p120','300000.5').bitrate,80000);
});
test('upstream streamer resolves the new custom dimensions rather than a default size',async()=>{
  const source=await readFile(new URL('../runtime/moonlight/package/static/stream/index.js',import.meta.url),'utf8');
  const first=source.indexOf('export function getStreamerSize(');
  const last=source.indexOf('function getVideoCodecHint(',first);
  assert.ok(first>=0 && last>first);
  const resolveSize=new Function(source.slice(first,last).replace('export function','function')+'\nreturn getStreamerSize;')();
  assert.deepEqual(resolveSize(presetSettings('2756x1268p120','300000'),[3840,2160]),[2756,1268]);
});
test('unknown saved presets and invalid bitrates fall back to a usable mode',()=>{
  assert.equal(getPreset('old-invalid-mode').id,'720p30');
  assert.equal(presetSettings('1080p60','NaN').bitrate,20000);
  assert.equal(presetSettings('1080p60','999999').bitrate,20000);
});
