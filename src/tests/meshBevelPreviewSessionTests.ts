import { canonicalMeshEdgeId, createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { MeshBevelPreviewSession } from '../modes/studio3d/modeling/MeshBevelPreviewSession';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshBevelPreviewSessionTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('preview always derives from immutable source snapshot',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const session=new MeshBevelPreviewSession(cut.mesh,cut.newLoopEdgeIds);const a=session.preview({widthRatio:0.08,segments:2,profile:0.5,curvature:0});const b=session.preview({widthRatio:0.16,segments:2,profile:0.5,curvature:0});const fresh=new MeshBevelPreviewSession(cut.mesh,cut.newLoopEdgeIds).preview({widthRatio:0.16,segments:2,profile:0.5,curvature:0});assert(JSON.stringify(b.mesh)===JSON.stringify(fresh.mesh),'second preview must not accumulate first preview topology');assert(JSON.stringify(a.mesh)!==JSON.stringify(b.mesh),'width change should alter preview')}));
 results.push(await test('cancel restores exact original mesh',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const session=new MeshBevelPreviewSession(cut.mesh,cut.newLoopEdgeIds);session.preview({widthRatio:0.1,segments:3,profile:0.6,curvature:0.5});assert(JSON.stringify(session.cancel())===JSON.stringify(cut.mesh),'cancel must return exact source snapshot')}));
 results.push(await test('preview classifies closed and interior-open paths',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const closed=new MeshBevelPreviewSession(cut.mesh,cut.newLoopEdgeIds).preview({widthRatio:0.1,segments:2,profile:0.5,curvature:0});const open=new MeshBevelPreviewSession(cut.mesh,cut.newLoopEdgeIds.slice(0,2)).preview({widthRatio:0.1,segments:2,profile:0.5,curvature:0});assert(closed.pathKind==='closed','full loop should classify closed');assert(open.pathKind==='interior-open','subset should classify interior-open')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
