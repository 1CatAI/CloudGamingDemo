export const MAX_BITRATE_KBPS=300000;
export const STREAM_PRESETS = Object.freeze([
  { id:'720p30', label:'720P · 30 FPS', videoSize:'720p', width:1280, height:720, fps:30, bitrate:6000 },
  { id:'720p60', label:'720P · 60 FPS', videoSize:'720p', width:1280, height:720, fps:60, bitrate:10000 },
  { id:'720p120', label:'720P · 120 FPS', videoSize:'720p', width:1280, height:720, fps:120, bitrate:20000 },
  { id:'1080p30', label:'1080P · 30 FPS', videoSize:'1080p', width:1920, height:1080, fps:30, bitrate:12000 },
  { id:'1080p60', label:'1080P · 60 FPS', videoSize:'1080p', width:1920, height:1080, fps:60, bitrate:20000 },
  { id:'1080p120', label:'1080P · 120 FPS', videoSize:'1080p', width:1920, height:1080, fps:120, bitrate:40000 },
  { id:'2756x1268p30', label:'2756×1268 · 30 FPS', videoSize:'custom', width:2756, height:1268, fps:30, bitrate:25000 },
  { id:'2756x1268p60', label:'2756×1268 · 60 FPS', videoSize:'custom', width:2756, height:1268, fps:60, bitrate:45000 },
  { id:'2756x1268p120', label:'2756×1268 · 120 FPS', videoSize:'custom', width:2756, height:1268, fps:120, bitrate:80000 }
]);
export function getPreset(id) { return STREAM_PRESETS.find(p=>p.id === id) || STREAM_PRESETS[0]; }
export function presetSettings(id, bitrate='auto') {
  const preset=getPreset(id);
  const requested=Number(bitrate);
  const settings={
    videoSize:preset.videoSize, fps:preset.fps,
    bitrate:bitrate !== 'auto' && Number.isInteger(requested) && requested >= 4000 && requested <= MAX_BITRATE_KBPS ? requested : preset.bitrate
  };
  if(preset.videoSize==='custom') settings.videoSizeCustom={width:preset.width,height:preset.height};
  return settings;
}
