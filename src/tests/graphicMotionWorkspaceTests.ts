import { alignGraphicLayers, distributeGraphicLayers, graphicToMotionProject, snapGraphicPosition } from '../creative/GraphicMotionWorkspace';
import type { MioGraphicDocument } from '../types/creative';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message);};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true};}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

const document:MioGraphicDocument={width:600,height:400,backgroundColor:'#000',layers:[
 {id:'a',name:'A',type:'shape',shapeType:'rectangle',visible:true,locked:false,opacity:1,x:13,y:20,width:100,height:50,fill:'#fff'},
 {id:'b',name:'B',type:'text',visible:true,locked:false,opacity:.8,x:240,y:80,width:120,height:40,fill:'#eee',text:'Mio',fontSize:24},
 {id:'c',name:'C',type:'shape',shapeType:'circle',visible:true,locked:false,opacity:1,x:480,y:140,width:60,height:60,fill:'#0ff'},
]};

export async function runGraphicMotionWorkspaceTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('graphic alignment is deterministic',()=>{const next=alignGraphicLayers(document,['a','b'],'left');assert(next.layers[0].x===next.layers[1].x,'left alignment failed');}));
 results.push(await test('graphic distribution preserves endpoints',()=>{const next=distributeGraphicLayers(document,['a','b','c'],'horizontal');assert(next.layers[0].x===13&&next.layers[2].x===480,'distribution moved endpoints');}));
 results.push(await test('graphic grid snapping is bounded to grid increments',()=>{assert(snapGraphicPosition(13,8)===16,'grid snap failed');assert(snapGraphicPosition(13,8,false)===13,'disabled snap changed value');}));
 results.push(await test('graphic to motion bridge keeps editable vector/text semantics',()=>{const motion=graphicToMotionProject(document,8,24);assert(motion.layers.length===3,'bridge dropped editable layers');assert(motion.layers[1].type==='text'&&motion.layers[1].text==='Mio','text semantics lost');assert(motion.duration===8&&motion.fps===24,'motion settings lost');}));
 for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
 return {passed:results.filter(r=>r.passed).length,total:results.length};
}
