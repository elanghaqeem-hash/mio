export interface BevelDragState { startX:number; startWidth:number; sensitivity:number }

export const beginBevelWidthDrag=(pointerX:number,widthRatio:number,sensitivity=0.0015):BevelDragState=>{
  if(!Number.isFinite(pointerX)||!Number.isFinite(widthRatio)||widthRatio<=0||widthRatio>=0.5)throw new Error('Invalid bevel drag start.');
  if(!Number.isFinite(sensitivity)||sensitivity<=0)throw new Error('Bevel drag sensitivity must be positive.');
  return{startX:pointerX,startWidth:widthRatio,sensitivity};
};
export const bevelWidthFromPointer=(state:BevelDragState,pointerX:number):number=>{
  if(!Number.isFinite(pointerX))return state.startWidth;
  return Math.min(0.49,Math.max(0.01,state.startWidth+(pointerX-state.startX)*state.sensitivity));
};
export const bevelSegmentsFromWheel=(segments:number,deltaY:number):number=>{
  if(!Number.isInteger(segments)||segments<1||segments>16)throw new Error('Bevel segments must be 1..16.');
  if(!Number.isFinite(deltaY)||deltaY===0)return segments;
  return Math.min(16,Math.max(1,segments+(deltaY<0?1:-1)));
};
