import type { Mio3DScene } from '../../../types/creative';
import type { MioModifierEvaluationResult } from './MeshModifierStack';
import { evaluateSceneObjectMesh } from './MeshBooleanSceneBinding';

export interface MeshEvaluationCacheStats { hits:number; misses:number; evictions:number; entries:number; }
export interface MeshEvaluationJob { jobId:string; objectId:string; scene:Mio3DScene; }
export interface MeshEvaluationJobResult { jobId:string; objectId:string; result:MioModifierEvaluationResult; }

const cloneResult=(result:MioModifierEvaluationResult):MioModifierEvaluationResult=>structuredClone(result);
const fnv1a=(value:string):string=>{
  let hash=0x811c9dc5;
  for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,0x01000193);}
  return(hash>>>0).toString(16).padStart(8,'0');
};
export const sceneGeometryFingerprint=(scene:Mio3DScene):string=>fnv1a(JSON.stringify(scene.objects));

export class SceneMeshEvaluationCache{
  private readonly entries=new Map<string,MioModifierEvaluationResult>();
  private hits=0;
  private misses=0;
  private evictions=0;
  public constructor(private readonly maxEntries=64){if(!Number.isInteger(maxEntries)||maxEntries<1)throw new Error('Mesh evaluation cache size must be a positive integer.');}
  public evaluate(scene:Mio3DScene,objectId:string):MioModifierEvaluationResult{
    const key=`${sceneGeometryFingerprint(scene)}:${objectId}`,cached=this.entries.get(key);
    if(cached){this.hits+=1;this.entries.delete(key);this.entries.set(key,cached);return cloneResult(cached);}
    this.misses+=1;
    const result=evaluateSceneObjectMesh(scene,objectId);
    this.entries.set(key,cloneResult(result));
    while(this.entries.size>this.maxEntries){const oldest=this.entries.keys().next().value as string|undefined;if(oldest===undefined)break;this.entries.delete(oldest);this.evictions+=1;}
    return cloneResult(result);
  }
  public clear():void{this.entries.clear();}
  public stats():MeshEvaluationCacheStats{return{hits:this.hits,misses:this.misses,evictions:this.evictions,entries:this.entries.size};}
}

export const createMeshEvaluationJob=(jobId:string,scene:Mio3DScene,objectId:string):MeshEvaluationJob=>({jobId,objectId,scene:structuredClone(scene)});
export const runMeshEvaluationJob=(job:MeshEvaluationJob):MeshEvaluationJobResult=>({
  jobId:job.jobId,
  objectId:job.objectId,
  result:evaluateSceneObjectMesh(structuredClone(job.scene),job.objectId),
});

export interface MeshEvaluationStressReport { iterations:number; hits:number; misses:number; hitRate:number; outputVertices:number; outputFaces:number; }
export const runMeshEvaluationStress=(scene:Mio3DScene,objectId:string,iterations=100):MeshEvaluationStressReport=>{
  if(!Number.isInteger(iterations)||iterations<1||iterations>10000)throw new Error('Stress iterations must be an integer from 1 to 10000.');
  const cache=new SceneMeshEvaluationCache(8);
  let result:MioModifierEvaluationResult|undefined;
  for(let index=0;index<iterations;index+=1)result=cache.evaluate(scene,objectId);
  const stats=cache.stats();
  return{iterations,hits:stats.hits,misses:stats.misses,hitRate:stats.hits/iterations,outputVertices:result?.mesh.vertices.length??0,outputFaces:result?.mesh.faces.length??0};
};
