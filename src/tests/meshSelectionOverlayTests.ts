import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { buildEdgeOverlayPositions, buildSelectedFaceOverlayGeometry, buildVertexOverlayPositions } from '../modes/studio3d/modeling/MeshSelectionOverlay';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
export async function runMeshSelectionOverlayTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('cube vertex overlay exposes eight points',()=>assert(buildVertexOverlayPositions(createCubeMesh()).length===24,'expected 8 xyz points')));
 results.push(await test('cube edge overlay exposes twelve line segments',()=>assert(buildEdgeOverlayPositions(createCubeMesh()).length===72,'expected 12 xyz line segments')));
 results.push(await test('selected quad face overlay triangulates into two triangles',()=>{const g=buildSelectedFaceOverlayGeometry(createCubeMesh(),{mode:'face',vertexIds:[],edgeIds:[],faceIds:['f_front']});assert(g.getAttribute('position').count===6,'expected six triangle vertices');g.dispose()}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
