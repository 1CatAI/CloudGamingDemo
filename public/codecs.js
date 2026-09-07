export const VIDEO_CODECS=Object.freeze([
  {id:'h265',label:'H.265',mime:'video/h265'},
  {id:'av1',label:'AV1',mime:'video/av1'}
]);
export function getCodec(id){return VIDEO_CODECS.find(codec=>codec.id===id) || VIDEO_CODECS[0];}
export function browserSupportsCodec(capabilities,id){
  const codec=getCodec(id);
  return Boolean(capabilities?.codecs?.some(c=>{
    if(c.mimeType?.toLowerCase() !== codec.mime) return false;
    if(id==='av1'){
      const profile=/(?:^|;)\s*profile\s*=\s*(\d+)/i.exec(c.sdpFmtpLine || '');
      return !profile || profile[1]==='0';
    }
    return true;
  }));
}
