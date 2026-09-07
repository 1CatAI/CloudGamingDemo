import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function patchMediaFeatures(staticRoot){
  async function edit(relative,replacements){
    const file=path.join(staticRoot,relative);
    let source=(await readFile(file,'utf8')).replaceAll('\r\n','\n');
    for(const [before,after] of replacements){
      if(source.includes(after)) continue;
      if(!source.includes(before)) throw new Error(`Unexpected upstream file: ${relative}`);
      source=source.replace(before,after);
    }
    await writeFile(file,source);
  }
  await edit('stream/index.js',[
    ['videoCodecHint.AV1_MAIN8 = true;\n        videoCodecHint.AV1_MAIN10 = true;','videoCodecHint.AV1_MAIN8 = true;\n        videoCodecHint.AV1_MAIN10 = false;'],
    ['videoCodecHint.AV1_HIGH8_444 = true;','videoCodecHint.AV1_HIGH8_444 = false;'],
    ['videoCodecHint.AV1_HIGH10_444 = true;','videoCodecHint.AV1_HIGH10_444 = false;']
  ]);
  await edit('stream/stats.js',[
    ['if ("Rtt" in msg) {','if ("Rtt" in msg) {\n            this.statsData.hostRttUpdatedAtMs = performance.now();'],
    ['else if ("Video" in msg) {','else if ("Video" in msg) {\n            this.statsData.videoStatsUpdatedAtMs = performance.now();']
  ]);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await patchMediaFeatures(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime/moonlight/package/static'));
  console.log('AV1 Main 8-bit and timestamped host statistics ready.');
}
