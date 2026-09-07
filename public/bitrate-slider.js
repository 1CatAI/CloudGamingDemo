export const BITRATE_STEPS=Object.freeze(['auto',4000,6000,10000,15000,20000,25000,50000,75000,100000,150000,200000,250000,300000]);
export function bitrateChoice(position){
  const index=Number(position);
  return Number.isInteger(index) && index>=0 && index<BITRATE_STEPS.length ? String(BITRATE_STEPS[index]) : 'auto';
}
export function bitratePosition(choice){
  const index=BITRATE_STEPS.findIndex(value=>String(value)===String(choice));
  return index<0?0:index;
}
