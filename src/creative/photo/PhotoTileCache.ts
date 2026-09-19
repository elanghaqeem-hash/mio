import type { PhotoDirtyRegion } from './PhotoRenderGraph';
export type PhotoTileSize=256|512;
export interface PhotoTileCoordinate {x:number;y:number;}
export interface PhotoTile {id:string;coordinate:PhotoTileCoordinate;bounds:PhotoDirtyRegion;cacheKey:string;}
export const choosePhotoTileSize=(width:number,height:number):PhotoTileSize=>width*height>=16_000_000?512:256;
export const photoTilesForRegion=(documentId:string,revision:number,canvas:{width:number;height:number},region?:PhotoDirtyRegion,tileSize:PhotoTileSize=choosePhotoTileSize(canvas.width,canvas.height)):PhotoTile[]=>{
 const r=region??{x:0,y:0,width:canvas.width,height:canvas.height};const left=Math.max(0,Math.floor(r.x/tileSize)),top=Math.max(0,Math.floor(r.y/tileSize)),right=Math.min(Math.ceil(canvas.width/tileSize)-1,Math.floor((r.x+r.width-1)/tileSize)),bottom=Math.min(Math.ceil(canvas.height/tileSize)-1,Math.floor((r.y+r.height-1)/tileSize));const tiles:PhotoTile[]=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const px=x*tileSize,py=y*tileSize,bounds={x:px,y:py,width:Math.min(tileSize,canvas.width-px),height:Math.min(tileSize,canvas.height-py)};tiles.push({id:`tile:${x}:${y}`,coordinate:{x,y},bounds,cacheKey:`${documentId}:${revision}:${tileSize}:${x}:${y}`});}
 return tiles;
};
export class PhotoTileCache<T>{
 private entries=new Map<string,{value:T;lastUsed:number;bytes:number}>();
 private clock=0; private bytesUsed=0;
 public constructor(private readonly capacity:number,private readonly byteBudget=Infinity){if(!Number.isInteger(capacity)||capacity<1)throw new Error('Photo tile cache capacity must be a positive integer.');if(byteBudget<=0)throw new Error('Photo tile cache byte budget must be positive.');}
 public get(key:string):T|undefined{const e=this.entries.get(key);if(!e)return undefined;e.lastUsed=++this.clock;return e.value;}
 public set(key:string,value:T,bytes=1):void{if(!Number.isFinite(bytes)||bytes<0)throw new Error('Photo tile cache entry bytes must be finite and non-negative.');const previous=this.entries.get(key);if(previous)this.bytesUsed-=previous.bytes;this.entries.set(key,{value,lastUsed:++this.clock,bytes});this.bytesUsed+=bytes;while(this.entries.size>this.capacity||this.bytesUsed>this.byteBudget){let oldest:string|undefined,time=Infinity;for(const [k,e] of this.entries)if(e.lastUsed<time){oldest=k;time=e.lastUsed;}if(!oldest)break;const removed=this.entries.get(oldest);if(removed)this.bytesUsed-=removed.bytes;this.entries.delete(oldest);}}
 public has(key:string):boolean{return this.entries.has(key);}
 public clear():void{this.entries.clear();this.bytesUsed=0;}
 public get size():number{return this.entries.size;}
 public get bytes():number{return this.bytesUsed;}
}
