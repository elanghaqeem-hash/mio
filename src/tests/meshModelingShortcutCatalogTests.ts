import { MESH_MODELING_SHORTCUT_GROUPS } from '../modes/studio3d/modeling/MeshModelingShortcutCatalog';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshModelingShortcutCatalogTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('shortcut catalog groups are uniquely named and non-empty',()=>{const titles=MESH_MODELING_SHORTCUT_GROUPS.map(group=>group.title);assert(new Set(titles).size===titles.length,'group titles must be unique');assert(MESH_MODELING_SHORTCUT_GROUPS.every(group=>group.items.length>0),'every group must contain shortcuts')}));
 results.push(await test('shortcut catalog exposes required core workflow keys',()=>{const keys=new Set(MESH_MODELING_SHORTCUT_GROUPS.flatMap(group=>group.items.map(item=>item.keys)));for(const required of ['Tab','?','Q','W','E','R','1','2','3','Ctrl/Cmd + D','Delete'])assert(keys.has(required),`missing shortcut ${required}`)}));
 results.push(await test('component shortcuts are explicitly Edit-scoped',()=>{const components=MESH_MODELING_SHORTCUT_GROUPS.find(group=>group.title==='Components');if(!components)throw new Error('Components group missing');assert(components.items.every(item=>item.scope==='Edit'),'component shortcuts must be Edit-scoped')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
