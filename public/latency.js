const valid=value=>typeof value==='number' && Number.isFinite(value) && value>=0;
const number=value=>valid(value)?value:null;
function averageDelta(current,previous,sum,count){
  if(!previous || !valid(current[sum]) || !valid(previous[sum]) || !valid(current[count]) || !valid(previous[count])) return null;
  const n=current[count]-previous[count],total=current[sum]-previous[sum];
  return n>0 && total>=0 ? total*1000/n : null;
}
export function selectedNetworkRtt(report,inbound){
  const transport=report.get(inbound.transportId);
  let pair=transport?.selectedCandidatePairId ? report.get(transport.selectedCandidatePairId) : null;
  if(!pair) pair=[...report.values()].find(s=>s.type==='candidate-pair' && s.nominated && s.state==='succeeded');
  const seconds=number(pair?.currentRoundTripTime);
  return seconds===null ? null : seconds*1000;
}
const fresh=(at,now)=>valid(at) && now>=at && now-at<=3500;

// Video capture -> decoded frame estimate. Counters are cumulative seconds;
// use interval deltas, and never add decode time twice to totalProcessingDelay.
export class VideoLatencyEstimator {
  constructor(){this.previous=null;}
  reset(){this.previous=null;}
  sample(report,host={},now=performance.now()){
    const inbound=[...report.values()].find(s=>s.type==='inbound-rtp' && (s.kind || s.mediaType)==='video' && !s.isRemote);
    if(!inbound){this.reset();return {totalMs:null,reason:'sampling',missing:['接收统计']};}
    const previous=this.previous;
    this.previous={...inbound};
    if(!previous || previous.id!==inbound.id || !valid(inbound.framesDecoded) || inbound.framesDecoded<previous.framesDecoded || inbound.timestamp<=previous.timestamp){
      return {totalMs:null,reason:'sampling',missing:[]};
    }
    if(inbound.framesDecoded===previous.framesDecoded) return {totalMs:null,reason:'no-frames',missing:[]};
    const decodeMs=averageDelta(inbound,previous,'totalDecodeTime','framesDecoded');
    const jitterBufferMs=averageDelta(inbound,previous,'jitterBufferDelay','jitterBufferEmittedCount');
    let receiverMs=averageDelta(inbound,previous,'totalProcessingDelay','framesDecoded');
    let receiveMethod='processing';
    if(receiverMs===null || (decodeMs!==null && receiverMs+0.001<decodeMs)){
      receiverMs=decodeMs!==null && jitterBufferMs!==null ? decodeMs+jitterBufferMs : null;
      receiveMethod='buffer+decode';
    }
    const hostFresh=fresh(host.videoStatsUpdatedAtMs,now);
    const hostMs=hostFresh?number(host.avgHostProcessingLatencyMs):null;
    const bridgeMs=hostFresh?number(host.avgStreamerProcessingTimeMs):null;
    const browserRttMs=selectedNetworkRtt(report,inbound);
    const localRttMs=fresh(host.hostRttUpdatedAtMs,now)?number(host.streamerRttMs):null;
    const networkMs=browserRttMs!==null && localRttMs!==null ? (browserRttMs+localRttMs)/2 : null;
    const missing=[];
    for(const [name,value] of [['采集/编码',hostMs],['主机转发',bridgeMs],['传输',networkMs],['接收/解码',receiverMs]]) if(value===null) missing.push(name);
    return {
      totalMs:missing.length?null:hostMs+bridgeMs+networkMs+receiverMs,
      reason:missing.length?'incomplete':'ok',missing,
      hostMs,bridgeMs,networkMs,browserRttMs,localRttMs,receiverMs,decodeMs,jitterBufferMs,receiveMethod,
      receiveOtherMs:receiverMs!==null && decodeMs!==null ? Math.max(0,receiverMs-decodeMs) : null
    };
  }
}
export function latencyLabel(sample){
  if(valid(sample?.totalMs)) return `总延迟 ≈${sample.totalMs.toFixed(1)} ms`;
  return sample?.reason==='no-frames'?'延迟：无新画面':sample?.reason==='incomplete'?'延迟：统计不全':'延迟：采样中';
}
export function formatMs(value){return valid(value)?`${value.toFixed(1)} ms`:'—';}
