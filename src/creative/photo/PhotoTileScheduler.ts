import type { PhotoTile } from './PhotoTileCache';
export type PhotoTilePriority='interactive'|'foreground'|'background';
export interface PhotoViewport {x:number;y:number;width:number;height:number;}
export interface PhotoScheduledTile {tile:PhotoTile;priority:PhotoTilePriority;distance:number;generation:number;}
const intersects=(a:PhotoTile['bounds'],b:PhotoViewport)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const distance=(a:PhotoTile['bounds'],b:PhotoViewport)=>{const dx=Math.max(b.x-a.x,0,a.x-(b.x+b.width));const dy=Math.max(b.y-a.y,0,a.y-(b.y+b.height));return Math.hypot(dx,dy);};
export const schedulePhotoTiles=(tiles:PhotoTile[],viewport:PhotoViewport,generation:number,preload=512):PhotoScheduledTile[]=>{
 const expanded={x:viewport.x-preload,y:viewport.y-preload,width:viewport.width+preload*2,height:viewport.height+preload*2};
 return tiles.map(tile=>{const visible=intersects(tile.bounds,viewport),near=intersects(tile.bounds,expanded);return {tile,priority:visible?'interactive':near?'foreground':'background',distance:distance(tile.bounds,viewport),generation};}).sort((a,b)=>{const rank=(p:PhotoTilePriority)=>p==='interactive'?0:p==='foreground'?1:2;return rank(a.priority)-rank(b.priority)||a.distance-b.distance||a.tile.id.localeCompare(b.tile.id);});
};
export const isPhotoTileScheduleCurrent=(task:PhotoScheduledTile,currentGeneration:number)=>task.generation===currentGeneration;
