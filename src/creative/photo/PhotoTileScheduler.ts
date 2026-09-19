import type { PhotoTile } from './PhotoTileCache';
export type PhotoTilePriority='interactive'|'foreground'|'background';
export interface PhotoViewport {x:number;y:number;width:number;height:number;}
export interface PhotoScheduledTile {tile:PhotoTile;priority:PhotoTilePriority;distance:number;generation:number;cacheHit:boolean;score:number;}
export interface PhotoTileSchedulerOptions {preload?:number;cachedKeys?:ReadonlySet<string>;maxConcurrent?:number;velocity?:{x:number;y:number};}
const intersects=(a:PhotoTile['bounds'],b:PhotoViewport)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const distance=(a:PhotoTile['bounds'],b:PhotoViewport)=>{const dx=Math.max(b.x-a.x,0,a.x-(b.x+b.width));const dy=Math.max(b.y-a.y,0,a.y-(b.y+b.height));return Math.hypot(dx,dy);};
export const schedulePhotoTiles=(tiles:PhotoTile[],viewport:PhotoViewport,generation:number,preload=512):PhotoScheduledTile[]=>{
 const expanded={x:viewport.x-preload,y:viewport.y-preload,width:viewport.width+preload*2,height:viewport.height+preload*2};
 return tiles.map(tile=>{const visible=intersects(tile.bounds,viewport),near=intersects(tile.bounds,expanded);const priority=visible?'interactive':near?'foreground':'background';return {tile,priority,distance:distance(tile.bounds,viewport),generation,cacheHit:false,score:(priority==='interactive'?0:priority==='foreground'?100000:200000)+distance(tile.bounds,viewport)};}).sort((a,b)=>{const rank=(p:PhotoTilePriority)=>p==='interactive'?0:p==='foreground'?1:2;return rank(a.priority)-rank(b.priority)||a.distance-b.distance||a.tile.id.localeCompare(b.tile.id);});
};
export const isPhotoTileScheduleCurrent=(task:PhotoScheduledTile,currentGeneration:number)=>task.generation===currentGeneration;

export const planPhotoTileQueue=(tiles:PhotoTile[],viewport:PhotoViewport,generation:number,options:PhotoTileSchedulerOptions={}):PhotoScheduledTile[]=>{const base=schedulePhotoTiles(tiles,viewport,generation,options.preload??512);const vx=options.velocity?.x??0,vy=options.velocity?.y??0;return base.map(t=>{const hit=options.cachedKeys?.has(t.tile.cacheKey)??false;const projected=t.tile.bounds.x*vx+t.tile.bounds.y*vy;return {...t,cacheHit:hit,score:t.score+(hit?1_000_000:0)-projected*0.001};}).filter(t=>!t.cacheHit).slice(0,Math.max(1,options.maxConcurrent??base.length));};
