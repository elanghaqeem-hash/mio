import type { MioMeshData, MioMeshFace } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';

export interface MeshVertexWeldResult {
  mesh: MioMeshData;
  survivorVertexId: string;
  removedVertexIds: string[];
  removedFaceIds: string[];
  updatedFaceIds: string[];
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const compactFaceVertexIds=(vertexIds:string[]):string[]=>{
  const compact:string[]=[];
  for(const id of vertexIds){
    if(compact[compact.length-1]!==id)compact.push(id);
  }
  if(compact.length>1&&compact[0]===compact[compact.length-1])compact.pop();
  const seen=new Set<string>();
  return compact.filter(id=>seen.has(id)?false:(seen.add(id),true));
};

export const weldMeshVertices=(mesh:MioMeshData,vertexIds:string[]):MeshVertexWeldResult=>{
  ensureValid(mesh);
  const selected=[...new Set(vertexIds)];
  if(selected.length<2)throw new Error('Vertex weld requires at least two distinct vertices.');
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  for(const id of selected)if(!vertexById.has(id))throw new Error(`Vertex weld selection contains missing vertex ${id}.`);

  const ordered=[...selected].sort((a,b)=>a.localeCompare(b));
  const survivorVertexId=ordered[0];
  const survivorSet=new Set(selected);
  const selectedVertices=selected.map(id=>vertexById.get(id)!);
  const average=selectedVertices.reduce((acc,vertex)=>[
    acc[0]+vertex.position[0],
    acc[1]+vertex.position[1],
    acc[2]+vertex.position[2],
  ] as [number,number,number],[0,0,0] as [number,number,number]).map(value=>value/selectedVertices.length) as [number,number,number];

  const removedFaceIds:string[]=[];
  const updatedFaceIds:string[]=[];
  const faces:MioMeshFace[]=[];

  for(const face of mesh.faces){
    const mapped=face.vertexIds.map(id=>survivorSet.has(id)?survivorVertexId:id);
    const compacted=compactFaceVertexIds(mapped);
    if(new Set(compacted).size<3){
      removedFaceIds.push(face.id);
      continue;
    }
    if(JSON.stringify(compacted)!==JSON.stringify(face.vertexIds))updatedFaceIds.push(face.id);
    faces.push({...structuredClone(face),vertexIds:compacted});
  }

  const vertices=mesh.vertices
    .filter(vertex=>vertex.id===survivorVertexId||!survivorSet.has(vertex.id))
    .map(vertex=>vertex.id===survivorVertexId?{...structuredClone(vertex),position:average}:structuredClone(vertex));

  const result:MioMeshData={vertices,faces};
  ensureValid(result);
  return{
    mesh:result,
    survivorVertexId,
    removedVertexIds:selected.filter(id=>id!==survivorVertexId),
    removedFaceIds,
    updatedFaceIds,
  };
};


export interface MeshVertexWeldByDistanceResult {
  mesh: MioMeshData;
  weldedGroups: string[][];
  survivorVertexIds: string[];
  removedVertexIds: string[];
  removedFaceIds: string[];
}

export const weldMeshVerticesByDistance=(
  mesh:MioMeshData,
  threshold:number,
  candidateVertexIds:string[]=mesh.vertices.map(vertex=>vertex.id),
):MeshVertexWeldByDistanceResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(threshold)||threshold<=0)throw new Error('Weld distance must be a positive finite number.');
  const candidates=[...new Set(candidateVertexIds)].sort((a,b)=>a.localeCompare(b));
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  for(const id of candidates)if(!vertexById.has(id))throw new Error(`Weld-by-distance selection contains missing vertex ${id}.`);

  const parent=new Map(candidates.map(id=>[id,id]));
  const find=(id:string):string=>{
    let root=parent.get(id)!;
    while(root!==parent.get(root)!)root=parent.get(root)!;
    let current=id;
    while(current!==root){const next=parent.get(current)!;parent.set(current,root);current=next;}
    return root;
  };
  const union=(a:string,b:string):void=>{
    const ra=find(a),rb=find(b);
    if(ra===rb)return;
    const [first,second]=ra.localeCompare(rb)<=0?[ra,rb]:[rb,ra];
    parent.set(second,first);
  };

  for(let i=0;i<candidates.length;i+=1){
    const a=vertexById.get(candidates[i])!;
    for(let j=i+1;j<candidates.length;j+=1){
      const b=vertexById.get(candidates[j])!;
      const dx=a.position[0]-b.position[0],dy=a.position[1]-b.position[1],dz=a.position[2]-b.position[2];
      if(Math.hypot(dx,dy,dz)<=threshold)union(a.id,b.id);
    }
  }

  const groupsByRoot=new Map<string,string[]>();
  for(const id of candidates){
    const root=find(id);
    const group=groupsByRoot.get(root)??[];
    group.push(id);
    groupsByRoot.set(root,group);
  }
  const weldedGroups=[...groupsByRoot.values()].filter(group=>group.length>1).map(group=>group.sort((a,b)=>a.localeCompare(b)));

  let working=structuredClone(mesh);
  const survivorVertexIds:string[]=[];
  const removedVertexIds:string[]=[];
  const removedFaceIds=new Set<string>();
  for(const group of weldedGroups){
    const result=weldMeshVertices(working,group);
    working=result.mesh;
    survivorVertexIds.push(result.survivorVertexId);
    removedVertexIds.push(...result.removedVertexIds);
    result.removedFaceIds.forEach(id=>removedFaceIds.add(id));
  }

  ensureValid(working);
  return{
    mesh:working,
    weldedGroups,
    survivorVertexIds,
    removedVertexIds,
    removedFaceIds:[...removedFaceIds],
  };
};
