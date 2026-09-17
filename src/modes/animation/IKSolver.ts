export type Vec3 = [number, number, number];
export interface TwoBoneIKInput { root: Vec3; target: Vec3; pole?: Vec3; upperLength: number; lowerLength: number; }
export interface TwoBoneIKResult { joint: Vec3; end: Vec3; reachable: boolean; }
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:Vec3,s:number):Vec3=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(a:Vec3)=>Math.sqrt(dot(a,a));
const normalize=(a:Vec3):Vec3=>{const l=length(a);return l>1e-8?mul(a,1/l):[1,0,0]};
export const solveTwoBoneIK=(input:TwoBoneIKInput):TwoBoneIKResult=>{
 const upper=Math.max(1e-6,input.upperLength),lower=Math.max(1e-6,input.lowerLength);const delta=sub(input.target,input.root);const rawDistance=length(delta);const maxReach=upper+lower;const minReach=Math.abs(upper-lower);const distance=Math.max(minReach+1e-6,Math.min(maxReach-1e-6,rawDistance));const direction=normalize(delta);
 const poleDirection=normalize(sub(input.pole??[input.root[0],input.root[1]+1,input.root[2]],input.root));let normal=normalize(cross(direction,poleDirection));if(length(normal)<1e-6)normal=[0,0,1];const bend=normalize(cross(normal,direction));
 const along=(upper*upper+distance*distance-lower*lower)/(2*distance);const height=Math.sqrt(Math.max(0,upper*upper-along*along));const joint=add(add(input.root,mul(direction,along)),mul(bend,height));const end=add(input.root,mul(direction,Math.min(rawDistance,maxReach)));
 return {joint,end,reachable:rawDistance<=maxReach&&rawDistance>=minReach};
};
