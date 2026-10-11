import type { FileAsset } from './contracts';
import { BoundedLruCache } from '../performance/BoundedLruCache';
export interface FileScanCacheKey{workspaceId:string;relativePath:string;bytes:number;modifiedAtMs?:number;}
const keyOf=(v:FileScanCacheKey):string=>JSON.stringify([v.workspaceId,v.relativePath,v.bytes,v.modifiedAtMs??null]);
export class FileScanCache{private readonly entries:BoundedLruCache<string,FileAsset>;constructor(maxEntries=5000){this.entries=new BoundedLruCache(maxEntries);}get(key:FileScanCacheKey){const a=this.entries.get(keyOf(key));return a?structuredClone(a):undefined;}put(key:FileScanCacheKey,asset:FileAsset){this.entries.set(keyOf(key),structuredClone(asset));}invalidateWorkspace(workspaceId:string){let removed=0;for(const [key,asset] of this.entries.entries()){if(asset.identity.workspaceId===workspaceId){this.entries.delete(key);removed++;}}return removed;}clear(){this.entries.clear();}get size(){return this.entries.size;}}
