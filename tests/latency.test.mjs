import test from 'node:test';
import assert from 'node:assert/strict';
import {VideoLatencyEstimator,selectedNetworkRtt,latencyLabel} from '../public/latency.js';
const host={avgHostProcessingLatencyMs:2,avgStreamerProcessingTimeMs:1,streamerRttMs:2,videoStatsUpdatedAtMs:1000,hostRttUpdatedAtMs:1000};
function report(n=1,overrides={}){
 const inbound={id:'video1',type:'inbound-rtp',kind:'video',transportId:'transport1',timestamp:n*1000,framesDecoded:n*60,totalDecodeTime:n*.18,totalProcessingDelay:n*.48,jitterBufferDelay:n*.3,jitterBufferEmittedCount:n*60,...overrides};
 return new Map([['video1',inbound],['transport1',{type:'transport',selectedCandidatePairId:'selected'}],['selected',{type:'candidate-pair',nominated:true,state:'succeeded',currentRoundTripTime:.01}],['old',{type:'candidate-pair',nominated:true,state:'succeeded',currentRoundTripTime:1}]]);
}
test('total includes encode, bridge, transmission and receiver processing, without double-counting decode',()=>{
 const meter=new VideoLatencyEstimator();assert.equal(meter.sample(report(),host,1000).totalMs,null);
 const sample=meter.sample(report(2),host,2000);
 assert.equal(sample.hostMs,2);assert.equal(sample.bridgeMs,1);assert.equal(sample.networkMs,6);
 assert.equal(sample.receiverMs,8);assert.equal(sample.decodeMs,3);assert.equal(sample.receiveOtherMs,5);
 assert.equal(sample.totalMs,17);assert.match(latencyLabel(sample),/≈17.0 ms/);
});
test('uses interval deltas rather than lifetime totals',()=>{
 const meter=new VideoLatencyEstimator();meter.sample(report(),host,1000);
 const sample=meter.sample(report(2,{totalProcessingDelay:1.08}),host,2000);
 assert.ok(Math.abs(sample.receiverMs-10)<.00001);assert.ok(Math.abs(sample.totalMs-19)<.00001);
});
test('fallback combines jitter buffer and decoding when processing counter is missing',()=>{
 const meter=new VideoLatencyEstimator();meter.sample(report(1,{totalProcessingDelay:undefined}),host,1000);
 const sample=meter.sample(report(2,{totalProcessingDelay:undefined}),host,2000);
 assert.equal(sample.receiveMethod,'buffer+decode');assert.equal(sample.totalMs,17);
});
test('missing or stale host statistics do not masquerade as zero milliseconds',()=>{
 const meter=new VideoLatencyEstimator();meter.sample(report(),host,1000);
 assert.equal(meter.sample(report(2),{...host,avgHostProcessingLatencyMs:null},2000).totalMs,null);
 assert.equal(meter.sample(report(3),host,5001).reason,'incomplete');
});
test('counter resets and freezes discard stale latency estimates',()=>{
 const meter=new VideoLatencyEstimator();meter.sample(report(),host,1000);
 assert.equal(meter.sample(report(),host,1100).totalMs,null);
 assert.equal(meter.sample(report(2,{framesDecoded:60}),host,2000).reason,'no-frames');
 assert.equal(meter.sample(report(3,{framesDecoded:1}),host,2500).reason,'sampling');
});
test('RTT comes from the selected ICE path',()=>{
 const stats=report();assert.equal(selectedNetworkRtt(stats,stats.get('video1')),10);
});
test('inconsistent processing counters cannot make the total shorter than decoding',()=>{
 const meter=new VideoLatencyEstimator();meter.sample(report(1,{totalProcessingDelay:0}),host,1000);
 const sample=meter.sample(report(2,{totalProcessingDelay:0}),host,2000);
 assert.equal(sample.receiveMethod,'buffer+decode');assert.equal(sample.totalMs,17);
});
