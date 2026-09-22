import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { discoverQuadEdgeRing } from './MeshEdgeRing';

export interface MeshLoopCutResult {
  mesh: MioMeshData;
  ringEdgeIds: string[];
  cutFaceIds: string[];
  newVertexIds: string[];
  newFaceIds: string[];
  closed: boolean;
}

interface FaceRingConnector {
  face: MioMeshFace;
  edges: [{ edgeId:string; index:number }, { edgeId:string; index:number }];
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

const connectorForFace=(face:MioMeshFace,ringSet:Set<string>):FaceRingConnector=>{
  if(face.vertexIds.length!==4)throw new Error(`Loop Cut requires quads; face ${face.id} has ${face.vertexIds.length} vertices.`);
  const hits:Array<{edgeId:string;index:number}>=[];
  for(let index=0;index<4;index+=1){
    const edgeId=canonicalMeshEdgeId(face.vertexIds[index],face.vertexIds[(index+1)%4]);
    if(ringSet.has(edgeId))hits.push({edgeId,index});
  }
  if(hits.length!==2)throw new Error(`Loop Cut expected exactly two ring edges on face ${face.id}; found ${hits.length}.`);
  const delta=(hits[1].index-hits[0].index+4)%4;
  if(delta!==2)throw new Error(`Loop Cut ring edges are not opposite on face ${face.id}.`);
  return{face,edges:[hits[0],hits[1]]};
};

const orientationSign=(face:MioMeshFace,index:number,orientation:[string,string]):number=>{
  const a=face.vertexIds[index];
  const b=face.vertexIds[(index+1)%4];
  if(orientation[0]===a&&orientation[1]===b)return 1;
  if(orientation[0]===b&&orientation[1]===a)return -1;
  throw new Error(`Edge orientation does not match face ${face.id}.`);
};

const cyclicPath=(items:string[],start:number,end:number):string[]=>{
  const result=[items[start]];
  let index=start;
  while(index!==end){
    index=(index+1)%items.length;
    result.push(items[index]);
    if(result.length>items.length+1)throw new Error('Loop Cut cyclic path traversal overflow.');
  }
  return result;
};

export const loopCutMesh=(mesh:MioMeshData,seedEdgeId:string,ratio=0.5):MeshLoopCutResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw new Error('Loop Cut ratio must be greater than 0 and less than 1.');

  const ring=discoverQuadEdgeRing(mesh,seedEdgeId);
  const ringSet=new Set(ring.edgeIds);
  const edgeById=new Map(deriveMeshEdges(mesh).map(edge=>[edge.id,edge]));
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const connectors=new Map<string,FaceRingConnector>();

  for(const faceId of ring.faceIds){
    const face=faceById.get(faceId);
    if(!face)throw new Error(`Loop Cut ring references missing face ${faceId}.`);
    connectors.set(faceId,connectorForFace(face,ringSet));
  }

  const edgeToFaces=new Map<string,string[]>();
  for(const connector of connectors.values()){
    for(const edge of connector.edges){
      const list=edgeToFaces.get(edge.edgeId)??[];
      list.push(connector.face.id);
      edgeToFaces.set(edge.edgeId,list);
    }
  }

  const seed=edgeById.get(seedEdgeId);
  if(!seed)throw new Error(`Loop Cut seed edge ${seedEdgeId} does not exist.`);
  const seedOrientation=[...seed.vertexIds].sort((a,b)=>a.localeCompare(b)) as [string,string];
  const orientations=new Map<string,[string,string]>([[seedEdgeId,seedOrientation]]);
  const queue=[seedEdgeId];

  while(queue.length){
    const currentEdgeId=queue.shift()!;
    const currentOrientation=orientations.get(currentEdgeId)!;
    for(const faceId of edgeToFaces.get(currentEdgeId)??[]){
      const connector=connectors.get(faceId)!;
      const current=connector.edges.find(edge=>edge.edgeId===currentEdgeId);
      const other=connector.edges.find(edge=>edge.edgeId!==currentEdgeId);
      if(!current||!other)throw new Error(`Loop Cut connector for face ${faceId} is incomplete.`);
      const currentSign=orientationSign(connector.face,current.index,currentOrientation);
      const otherA=connector.face.vertexIds[other.index];
      const otherB=connector.face.vertexIds[(other.index+1)%4];
      const desired:[string,string]=currentSign===1?[otherB,otherA]:[otherA,otherB];
      const existing=orientations.get(other.edgeId);
      if(existing){
        if(existing[0]!==desired[0]||existing[1]!==desired[1])throw new Error('Loop Cut ring orientation constraints are contradictory.');
      }else{
        orientations.set(other.edgeId,desired);
        queue.push(other.edgeId);
      }
    }
  }

  if(orientations.size!==ring.edgeIds.length)throw new Error('Loop Cut could not orient every edge in the discovered ring.');

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(face=>face.id));
  const cutVertexByEdge=new Map<string,string>();
  const createdVertices:MioMeshVertex[]=[];

  for(const edgeId of ring.edgeIds){
    const orientation=orientations.get(edgeId)!;
    const start=vertexById.get(orientation[0]);
    const end=vertexById.get(orientation[1]);
    if(!start||!end)throw new Error(`Loop Cut could not resolve edge endpoints for ${edgeId}.`);
    const id=uniqueId(`${orientation[0]}_${orientation[1]}_loop`,usedVertexIds);
    usedVertexIds.add(id);
    cutVertexByEdge.set(edgeId,id);
    createdVertices.push({
      id,
      position:[
        start.position[0]+(end.position[0]-start.position[0])*ratio,
        start.position[1]+(end.position[1]-start.position[1])*ratio,
        start.position[2]+(end.position[2]-start.position[2])*ratio,
      ],
    });
  }

  const cutFaceSet=new Set(ring.faceIds);
  const newFaceIds:string[]=[];
  const faces:MioMeshFace[]=[];

  for(const face of mesh.faces){
    if(!cutFaceSet.has(face.id)){
      faces.push(structuredClone(face));
      continue;
    }
    const expanded:string[]=[];
    for(let index=0;index<4;index+=1){
      const current=face.vertexIds[index];
      const next=face.vertexIds[(index+1)%4];
      expanded.push(current);
      const edgeId=canonicalMeshEdgeId(current,next);
      const cutVertexId=cutVertexByEdge.get(edgeId);
      if(cutVertexId)expanded.push(cutVertexId);
    }
    const cutIndices=expanded.map((id,index)=>cutVertexByEdge.has([...cutVertexByEdge.entries()].find(([,vertexId])=>vertexId===id)?.[0]??'')?index:-1).filter(index=>index>=0);
    if(cutIndices.length!==2)throw new Error(`Loop Cut expected two inserted vertices on face ${face.id}; found ${cutIndices.length}.`);
    const firstPath=cyclicPath(expanded,cutIndices[0],cutIndices[1]);
    const secondPath=cyclicPath(expanded,cutIndices[1],cutIndices[0]);
    if(firstPath.length<3||secondPath.length<3)throw new Error(`Loop Cut produced a degenerate split on face ${face.id}.`);
    const newFaceId=uniqueId(`${face.id}_loop`,usedFaceIds);
    usedFaceIds.add(newFaceId);
    newFaceIds.push(newFaceId);
    faces.push({...structuredClone(face),vertexIds:firstPath});
    faces.push({...structuredClone(face),id:newFaceId,vertexIds:secondPath});
  }

  const result:MioMeshData={
    vertices:[...mesh.vertices.map(vertex=>structuredClone(vertex)),...createdVertices],
    faces,
  };
  ensureValid(result);
  return{
    mesh:result,
    ringEdgeIds:[...ring.edgeIds],
    cutFaceIds:[...ring.faceIds],
    newVertexIds:createdVertices.map(vertex=>vertex.id),
    newFaceIds,
    closed:ring.closed,
  };
};
