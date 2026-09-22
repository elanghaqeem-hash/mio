import type { MioMeshData, MioMeshFace } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshEdgeRing {
  seedEdgeId: string;
  edgeIds: string[];
  faceIds: string[];
  closed: boolean;
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const oppositeEdgeId=(face:MioMeshFace,incomingEdgeId:string):string=>{
  if(face.vertexIds.length!==4)throw new Error(`Edge ring requires quad faces; face ${face.id} has ${face.vertexIds.length} vertices.`);
  for(let index=0;index<4;index+=1){
    const a=face.vertexIds[index];
    const b=face.vertexIds[(index+1)%4];
    if(canonicalMeshEdgeId(a,b)!==incomingEdgeId)continue;
    return canonicalMeshEdgeId(face.vertexIds[(index+2)%4],face.vertexIds[(index+3)%4]);
  }
  throw new Error(`Face ${face.id} does not contain edge ${incomingEdgeId}.`);
};

interface RingWalk {
  edgeIds:string[];
  faceIds:string[];
  closed:boolean;
}

export const discoverQuadEdgeRing=(mesh:MioMeshData,seedEdgeId:string):MeshEdgeRing=>{
  ensureValid(mesh);
  const edges=deriveMeshEdges(mesh);
  const edgeById=new Map(edges.map(edge=>[edge.id,edge]));
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const seed=edgeById.get(seedEdgeId);
  if(!seed)throw new Error(`Mesh edge ${seedEdgeId} does not exist.`);
  if(seed.faceIds.length<1||seed.faceIds.length>2)throw new Error('Edge ring seed must be a boundary or manifold edge.');
  const seedFaces=[...seed.faceIds].sort((a,b)=>a.localeCompare(b));
  for(const faceId of seedFaces){
    const face=faceById.get(faceId);
    if(!face)throw new Error(`Seed edge references missing face ${faceId}.`);
    if(face.vertexIds.length!==4)throw new Error(`Edge ring seed touches non-quad face ${faceId}.`);
  }

  const walk=(startFaceId:string,globallyVisited:Set<string>):RingWalk=>{
    let currentFaceId=startFaceId;
    let incomingEdgeId=seedEdgeId;
    const localVisited=new Set<string>([seedEdgeId]);
    const edgeIds:string[]=[];
    const faceIds:string[]=[];
    while(true){
      const face=faceById.get(currentFaceId);
      if(!face)throw new Error(`Edge ring references missing face ${currentFaceId}.`);
      if(face.vertexIds.length!==4)throw new Error(`Edge ring traversal reached non-quad face ${currentFaceId}.`);
      faceIds.push(currentFaceId);
      const opposite=oppositeEdgeId(face,incomingEdgeId);
      if(opposite===seedEdgeId)return{edgeIds,faceIds,closed:true};
      if(localVisited.has(opposite)||globallyVisited.has(opposite))return{edgeIds,faceIds,closed:true};
      const edge=edgeById.get(opposite);
      if(!edge)throw new Error(`Derived opposite edge ${opposite} does not exist.`);
      if(edge.faceIds.length>2)throw new Error(`Edge ring traversal reached non-manifold edge ${opposite}.`);
      edgeIds.push(opposite);
      localVisited.add(opposite);
      globallyVisited.add(opposite);
      const nextFaces=edge.faceIds.filter(faceId=>faceId!==currentFaceId).sort((a,b)=>a.localeCompare(b));
      if(!nextFaces.length)return{edgeIds,faceIds,closed:false};
      currentFaceId=nextFaces[0];
      incomingEdgeId=opposite;
    }
  };

  const visited=new Set<string>([seedEdgeId]);
  const first=walk(seedFaces[0],visited);
  if(first.closed){
    return{
      seedEdgeId,
      edgeIds:[seedEdgeId,...first.edgeIds],
      faceIds:[...new Set(first.faceIds)],
      closed:true,
    };
  }

  if(seedFaces.length===1){
    return{
      seedEdgeId,
      edgeIds:[seedEdgeId,...first.edgeIds],
      faceIds:[...first.faceIds],
      closed:false,
    };
  }

  const second=walk(seedFaces[1],visited);
  return{
    seedEdgeId,
    edgeIds:[...first.edgeIds.reverse(),seedEdgeId,...second.edgeIds],
    faceIds:[...first.faceIds.reverse(),...second.faceIds.filter(id=>!first.faceIds.includes(id))],
    closed:second.closed,
  };
};
