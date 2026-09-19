import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { canonicalMeshEdgeId, validateMeshTopology } from './MeshTopology';

export interface MeshRegionInsetResult {
  mesh: MioMeshData;
  insetFaceIds: string[];
  createdVertexIds: string[];
  createdRingFaceIds: string[];
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const uniqueId=(base:string,used:Set<string>):string=>{
  if(!used.has(base))return base;
  let index=2;
  while(used.has(`${base}_${index}`))index+=1;
  return `${base}_${index}`;
};

const faceNormal=(face:MioMeshFace,vertexById:Map<string,MioMeshVertex>):[number,number,number]=>{
  let x=0,y=0,z=0;
  for(let index=0;index<face.vertexIds.length;index+=1){
    const current=vertexById.get(face.vertexIds[index]);
    const next=vertexById.get(face.vertexIds[(index+1)%face.vertexIds.length]);
    if(!current||!next)throw new Error(`Face ${face.id} references a missing vertex.`);
    x+=(current.position[1]-next.position[1])*(current.position[2]+next.position[2]);
    y+=(current.position[2]-next.position[2])*(current.position[0]+next.position[0]);
    z+=(current.position[0]-next.position[0])*(current.position[1]+next.position[1]);
  }
  const length=Math.hypot(x,y,z);
  if(length<=Number.EPSILON)throw new Error(`Face ${face.id} is degenerate.`);
  return [x/length,y/length,z/length];
};

const assertConnectedRegion=(faces:MioMeshFace[]):void=>{
  if(faces.length<=1)return;
  const owners=new Map<string,string[]>();
  for(const face of faces){
    for(let index=0;index<face.vertexIds.length;index+=1){
      const a=face.vertexIds[index];
      const b=face.vertexIds[(index+1)%face.vertexIds.length];
      const key=canonicalMeshEdgeId(a,b);
      const list=owners.get(key)??[];
      list.push(face.id);
      owners.set(key,list);
    }
  }
  const adjacency=new Map(faces.map(face=>[face.id,new Set<string>()]));
  for(const faceIds of owners.values()){
    if(faceIds.length!==2)continue;
    adjacency.get(faceIds[0])?.add(faceIds[1]);
    adjacency.get(faceIds[1])?.add(faceIds[0]);
  }
  const visited=new Set<string>();
  const queue=[faces[0].id];
  while(queue.length){
    const id=queue.shift()!;
    if(visited.has(id))continue;
    visited.add(id);
    for(const next of adjacency.get(id)??[])if(!visited.has(next))queue.push(next);
  }
  if(visited.size!==faces.length)throw new Error('Region inset requires one edge-connected face region.');
};

const assertCoplanar=(faces:MioMeshFace[],vertexById:Map<string,MioMeshVertex>):void=>{
  const reference=faceNormal(faces[0],vertexById);
  const origin=vertexById.get(faces[0].vertexIds[0])?.position;
  if(!origin)throw new Error('Region inset could not resolve its reference plane.');
  for(const face of faces){
    const normal=faceNormal(face,vertexById);
    const dot=reference[0]*normal[0]+reference[1]*normal[1]+reference[2]*normal[2];
    if(dot<0.999)throw new Error('Region inset currently requires consistently wound coplanar faces.');
    for(const vertexId of face.vertexIds){
      const vertex=vertexById.get(vertexId);
      if(!vertex)throw new Error(`Face ${face.id} references missing vertex ${vertexId}.`);
      const dx=vertex.position[0]-origin[0],dy=vertex.position[1]-origin[1],dz=vertex.position[2]-origin[2];
      const distance=Math.abs(dx*reference[0]+dy*reference[1]+dz*reference[2]);
      if(distance>1e-6)throw new Error('Region inset currently requires coplanar faces.');
    }
  }
};

export const insetMeshRegion=(mesh:MioMeshData,faceIds:string[],ratio:number):MeshRegionInsetResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw new Error('Region inset ratio must be greater than 0 and less than 1.');
  const selectedSet=new Set(faceIds);
  const selectedFaces=mesh.faces.filter(face=>selectedSet.has(face.id));
  if(!selectedFaces.length)throw new Error('Region inset requires at least one valid selected face.');
  if(selectedFaces.length!==selectedSet.size)throw new Error('Region inset selection contains missing face IDs.');

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  assertConnectedRegion(selectedFaces);
  assertCoplanar(selectedFaces,vertexById);

  const selectedVertexIds=[...new Set(selectedFaces.flatMap(face=>face.vertexIds))];
  const center=selectedVertexIds.reduce((acc,id)=>{
    const vertex=vertexById.get(id)!;
    return [acc[0]+vertex.position[0],acc[1]+vertex.position[1],acc[2]+vertex.position[2]] as [number,number,number];
  },[0,0,0] as [number,number,number]).map(value=>value/selectedVertexIds.length) as [number,number,number];

  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(face=>face.id));
  const duplicateBySource=new Map<string,string>();
  const createdVertices:MioMeshVertex[]=[];

  for(const sourceId of selectedVertexIds){
    const source=vertexById.get(sourceId)!;
    const id=uniqueId(`${sourceId}_region_inset`,usedVertexIds);
    usedVertexIds.add(id);
    duplicateBySource.set(sourceId,id);
    createdVertices.push({
      id,
      position:[
        source.position[0]+(center[0]-source.position[0])*ratio,
        source.position[1]+(center[1]-source.position[1])*ratio,
        source.position[2]+(center[2]-source.position[2])*ratio,
      ],
    });
  }

  const insetFaces:MioMeshFace[]=selectedFaces.map(face=>{
    const id=uniqueId(`${face.id}_region_inset`,usedFaceIds);
    usedFaceIds.add(id);
    return {...face,id,vertexIds:face.vertexIds.map(vertexId=>duplicateBySource.get(vertexId)!)};
  });

  const boundaryMap=new Map<string,{a:string;b:string;count:number;materialSlot?:number}>();
  for(const face of selectedFaces){
    for(let index=0;index<face.vertexIds.length;index+=1){
      const a=face.vertexIds[index];
      const b=face.vertexIds[(index+1)%face.vertexIds.length];
      const key=canonicalMeshEdgeId(a,b);
      const existing=boundaryMap.get(key);
      if(existing)existing.count+=1;
      else boundaryMap.set(key,{a,b,count:1,...(face.materialSlot===undefined?{}:{materialSlot:face.materialSlot})});
    }
  }

  const ringFaces:MioMeshFace[]=[];
  for(const boundary of [...boundaryMap.values()].filter(edge=>edge.count===1)){
    const da=duplicateBySource.get(boundary.a)!;
    const db=duplicateBySource.get(boundary.b)!;
    const id=uniqueId(`region_inset_ring_${boundary.a}_${boundary.b}`,usedFaceIds);
    usedFaceIds.add(id);
    ringFaces.push({
      id,
      vertexIds:[boundary.a,boundary.b,db,da],
      ...(boundary.materialSlot===undefined?{}:{materialSlot:boundary.materialSlot}),
    });
  }

  const result:MioMeshData={
    vertices:[...mesh.vertices.map(vertex=>structuredClone(vertex)),...createdVertices],
    faces:[
      ...mesh.faces.filter(face=>!selectedSet.has(face.id)).map(face=>structuredClone(face)),
      ...insetFaces,
      ...ringFaces,
    ],
  };
  ensureValid(result);
  return{
    mesh:result,
    insetFaceIds:insetFaces.map(face=>face.id),
    createdVertexIds:createdVertices.map(vertex=>vertex.id),
    createdRingFaceIds:ringFaces.map(face=>face.id),
  };
};
