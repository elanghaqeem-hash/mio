import type { MioMeshData, MioMeshFace } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshFaceFlipResult {
  mesh: MioMeshData;
  flippedFaceIds: string[];
}

export interface MeshWindingRecalculateResult {
  mesh: MioMeshData;
  flippedFaceIds: string[];
  componentCount: number;
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const edgeDirectionSign=(face:MioMeshFace,a:string,b:string):number=>{
  for(let index=0;index<face.vertexIds.length;index+=1){
    const current=face.vertexIds[index];
    const next=face.vertexIds[(index+1)%face.vertexIds.length];
    if(current===a&&next===b)return 1;
    if(current===b&&next===a)return -1;
  }
  return 0;
};

export const flipMeshFaces=(mesh:MioMeshData,faceIds:string[]):MeshFaceFlipResult=>{
  ensureValid(mesh);
  const selected=new Set(faceIds);
  if(!selected.size)throw new Error('Face flip requires at least one selected face.');
  const existing=new Set(mesh.faces.map(face=>face.id));
  for(const id of selected)if(!existing.has(id))throw new Error(`Face flip selection contains missing face ${id}.`);
  const result:MioMeshData={
    vertices:mesh.vertices.map(vertex=>structuredClone(vertex)),
    faces:mesh.faces.map(face=>selected.has(face.id)?{...structuredClone(face),vertexIds:[...face.vertexIds].reverse()}:structuredClone(face)),
  };
  ensureValid(result);
  return{mesh:result,flippedFaceIds:[...selected].sort((a,b)=>a.localeCompare(b))};
};

export const recalculateMeshWinding=(mesh:MioMeshData):MeshWindingRecalculateResult=>{
  ensureValid(mesh);
  const edges=deriveMeshEdges(mesh);
  const nonManifold=edges.filter(edge=>edge.faceIds.length>2);
  if(nonManifold.length)throw new Error('Winding recalculation requires manifold or boundary topology; non-manifold edges are not supported.');

  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const adjacency=new Map(mesh.faces.map(face=>[face.id,[] as Array<{neighborId:string;sameDirection:boolean}>]));

  for(const edge of edges){
    if(edge.faceIds.length!==2)continue;
    const first=faceById.get(edge.faceIds[0]);
    const second=faceById.get(edge.faceIds[1]);
    if(!first||!second)continue;
    const [a,b]=edge.vertexIds;
    const firstSign=edgeDirectionSign(first,a,b);
    const secondSign=edgeDirectionSign(second,a,b);
    if(firstSign===0||secondSign===0)throw new Error(`Could not resolve winding across edge ${edge.id}.`);
    const sameDirection=firstSign===secondSign;
    adjacency.get(first.id)?.push({neighborId:second.id,sameDirection});
    adjacency.get(second.id)?.push({neighborId:first.id,sameDirection});
  }

  const flipState=new Map<string,boolean>();
  let componentCount=0;

  for(const face of mesh.faces){
    if(flipState.has(face.id))continue;
    componentCount+=1;
    flipState.set(face.id,false);
    const queue=[face.id];
    while(queue.length){
      const currentId=queue.shift()!;
      const currentFlip=flipState.get(currentId)!;
      for(const relation of adjacency.get(currentId)??[]){
        const requiredFlip=relation.sameDirection?!currentFlip:currentFlip;
        const existing=flipState.get(relation.neighborId);
        if(existing===undefined){
          flipState.set(relation.neighborId,requiredFlip);
          queue.push(relation.neighborId);
        }else if(existing!==requiredFlip){
          throw new Error('Mesh winding constraints are contradictory; the component may be non-orientable or malformed.');
        }
      }
    }
  }

  const flippedFaceIds=[...flipState.entries()].filter(([,flipped])=>flipped).map(([id])=>id).sort((a,b)=>a.localeCompare(b));
  const flippedSet=new Set(flippedFaceIds);
  const result:MioMeshData={
    vertices:mesh.vertices.map(vertex=>structuredClone(vertex)),
    faces:mesh.faces.map(face=>flippedSet.has(face.id)?{...structuredClone(face),vertexIds:[...face.vertexIds].reverse()}:structuredClone(face)),
  };
  ensureValid(result);
  return{mesh:result,flippedFaceIds,componentCount};
};
