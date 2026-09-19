import { createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { extrudeMeshRegion } from '../modes/studio3d/modeling/MeshRegionExtrude';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshRegionExtrudeTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('single-face region extrude creates one cap and four sides',()=>{const r=extrudeMeshRegion(createCubeMesh(),['f_front'],1);assert(r.capFaceIds.length===1,'expected one cap');assert(r.createdSideFaceIds.length===4,'expected four boundary sides');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('two adjacent faces extrude as one region without internal side wall',()=>{const r=extrudeMeshRegion(createCubeMesh(),['f_front','f_top'],0.5);assert(r.createdVertexIds.length===6,'adjacent quads should duplicate six unique vertices');assert(r.capFaceIds.length===2,'expected two cap faces');assert(r.createdSideFaceIds.length===6,'shared edge must not produce an internal side wall');assert(r.mesh.faces.length===12,'expected 4 untouched + 2 caps + 6 sides');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('missing face ID is rejected',()=>{let threw=false;try{extrudeMeshRegion(createCubeMesh(),['missing'],1)}catch{threw=true}assert(threw,'missing face must throw')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
