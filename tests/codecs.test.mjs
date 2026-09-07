import test from 'node:test';
import assert from 'node:assert/strict';
import {getCodec,browserSupportsCodec} from '../public/codecs.js';
test('codec selection checks the chosen format without silently falling back',()=>{
 const caps={codecs:[{mimeType:'video/H265'},{mimeType:'video/AV1',sdpFmtpLine:'profile=0;level-idx=5;tier=0'}]};
 assert.equal(browserSupportsCodec(caps,'h265'),true);assert.equal(browserSupportsCodec(caps,'av1'),true);
 assert.equal(browserSupportsCodec({codecs:[{mimeType:'video/H265'}]},'av1'),false);
 assert.equal(browserSupportsCodec({codecs:[{mimeType:'video/AV1',sdpFmtpLine:'profile=1'}]},'av1'),false);
 assert.equal(getCodec('av1').mime,'video/av1');assert.equal(getCodec(null).id,'h265');
});
