import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { isVertexOnRailSegment, railParameter, resolveMeshEdgeRailSelection } from './MeshEdgeRail';

export interface MeshInteriorOpenBevelResult {
  mesh:MioMeshData;
  bevelFaceIds:string[];
  terminationFaceIds:string[];
  createdVertexIds:string[];
  removedVertexIds:string[];
  endpointVertexIds:[string,string];
  widthRatio:number;
}

const ensureValid=(mesh:MioMeshData):void=>{const v=validateMeshTopology(mesh);if(!v.valid)throw new Error(`Invalid mesh topology: ${v.errors.join(' ')}`)};
const uniqueId=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i+=1;return `${base}_${i}`};
const directedEdgeSign=(face:MioMeshFace,a:string,b:string):number=>{for(let i=0;i<face.vertexIds.length;i+=1){const x=face.vertexIds[i],y=face.vertexIds[(i+1)%face.vertexIds.length];if(x===a&&y===b)return 1;if(x===b&&y===a)return -1}return 0};
const interpolate=(a:MioMeshVertex,b:MioMeshVertex,t:number):[number,number,number]=>[a.position[0]+(b.position[0]-a.position[0])*t,a.position[1]+(b.position[1]-a.position[1])*t,a.position[2]+(b.position[2]-a.position[2])*t];

const insertVertexOnDirectedEdge=(face:MioMeshFace,a:string,b:string,insertId:string):MioMeshFace=>{
  const ids=[...face.vertexIds];
  for(let i=0;i<ids.length;i+=1){
    const next=(i+1)%ids.length;
    if((ids[i]===a&&ids[next]===b)||(ids[i]===b&&ids[next]===a)){
      ids.splice(i+1,0,insertId);
      return{...structuredClone(face),vertexIds:ids};
    }
  }
  throw new Error(`Face ${face.id} does not contain endpoint rail edge ${a}<->${b}.`);
};

export const bevelInteriorOpenEdgePath=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshInteriorOpenBevelResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(widthRatio)||widthRatio<=0||widthRatio>=0.5)throw new Error('Interior open bevel width ratio must be greater than 0 and less than 0.5.');
  const rail=resolveMeshEdgeRailSelection(mesh,edgeIds,false);
  if(rail.closed)throw new Error('Interior Open Bevel requires one open selected edge path.');

  const endpointVertexIds=[...rail.selectedAdjacency.entries()].filter(([,n])=>n.size===1).map(([id])=>id).sort((a,b)=>a.localeCompare(b));
  if(endpointVertexIds.length!==2)throw new Error(`Interior open bevel requires exactly two endpoints; found ${endpointVertexIds.length}.`);

  const allEdges=deriveMeshEdges(mesh);
  const edgeById=new Map(allEdges.map(edge=>[edge.id,edge]));
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const selectedVertexSet=new Set(rail.selectedVertexIds);
  const selectedEdgeSet=new Set(rail.selectedEdgeIds);

  const continuationByEndpoint=new Map<string,string>();
  for(const endpointId of endpointVertexIds){
    const incident=allEdges.filter(edge=>edge.vertexIds.includes(endpointId)&&!selectedEdgeSet.has(edge.id));
    const railNeighbors=new Set(rail.railByVertex.get(endpointId)??[]);
    const continuation=incident
      .map(edge=>edge.vertexIds[0]===endpointId?edge.vertexIds[1]:edge.vertexIds[0])
      .filter(id=>!railNeighbors.has(id));
    const unique=[...new Set(continuation)];
    if(unique.length!==1)throw new Error(`Interior bevel endpoint ${endpointId} requires exactly one continuation neighbor; found ${unique.length}.`);
    const continuationEdge=edgeById.get(canonicalMeshEdgeId(endpointId,unique[0]));
    if(!continuationEdge||continuationEdge.faceIds.length!==2)throw new Error(`Interior bevel endpoint ${endpointId} continuation edge must be manifold.`);
    const boundaryRail=incident.filter(edge=>edge.faceIds.length===1);
    if(boundaryRail.length)throw new Error(`Interior bevel endpoint ${endpointId} touches a mesh boundary; use boundary-open bevel.`);
    continuationByEndpoint.set(endpointId,unique[0]);
  }

  const usedVertexIds=new Set(mesh.vertices.map(v=>v.id));
  const usedFaceIds=new Set(mesh.faces.map(f=>f.id));
  const duplicates=new Map<string,[string,string]>();
  const createdVertices:MioMeshVertex[]=[];
  for(const vertexId of rail.selectedVertexIds){
    const vertex=vertexById.get(vertexId)!;
    const rails=rail.railByVertex.get(vertexId)!;
    const side0=vertexById.get(rails[0])!,side1=vertexById.get(rails[1])!;
    if(!isVertexOnRailSegment(vertex,side0,side1))throw new Error(`Interior bevel vertex ${vertexId} is not on its inferred rail segment.`);
    const t=railParameter(vertex,side0,side1);
    if(t-widthRatio<=1e-6||t+widthRatio>=1-1e-6)throw new Error(`Interior bevel width ${widthRatio} exceeds available rail space at vertex ${vertexId}.`);
    const id0=uniqueId(`${vertexId}_interior_bevel_0`,usedVertexIds);usedVertexIds.add(id0);
    const id1=uniqueId(`${vertexId}_interior_bevel_1`,usedVertexIds);usedVertexIds.add(id1);
    duplicates.set(vertexId,[id0,id1]);
    createdVertices.push({id:id0,position:interpolate(side0,side1,t-widthRatio)},{id:id1,position:interpolate(side0,side1,t+widthRatio)});
  }

  const faceToSelectedEdge=new Map<string,string>();
  for(const edgeId of rail.selectedEdgeIds){
    const edge=edgeById.get(edgeId);
    if(!edge||edge.faceIds.length!==2)throw new Error(`Interior bevel selected edge ${edgeId} must be manifold.`);
    const faces=edge.faceIds.map(id=>faceById.get(id)!);
    if((faces[0].materialSlot??0)!==(faces[1].materialSlot??0))throw new Error(`Interior bevel does not cross material boundary on edge ${edgeId}.`);
    for(const face of faces){
      if(faceToSelectedEdge.has(face.id))throw new Error(`Interior bevel adjacent face ${face.id} touches multiple selected edges; unsupported corner fan.`);
      faceToSelectedEdge.set(face.id,edgeId);
    }
  }

  const endpointFarFaceSide=new Map<string,Map<0|1,string>>();
  for(const endpointId of endpointVertexIds){
    const rails=rail.railByVertex.get(endpointId)!;
    const sideFaces=new Map<0|1,string>();
    for(const side of [0,1] as const){
      const railEdge=edgeById.get(canonicalMeshEdgeId(endpointId,rails[side]));
      if(!railEdge||railEdge.faceIds.length!==2)throw new Error(`Interior endpoint ${endpointId} rail edge must be manifold.`);
      const far=railEdge.faceIds.filter(faceId=>!faceToSelectedEdge.has(faceId));
      if(far.length!==1)throw new Error(`Interior endpoint ${endpointId} side ${side} requires one continuation-fan face; found ${far.length}.`);
      sideFaces.set(side,far[0]);
    }
    if(sideFaces.get(0)===sideFaces.get(1))throw new Error(`Interior endpoint ${endpointId} fan collapses to one face.`);
    endpointFarFaceSide.set(endpointId,sideFaces);
  }

  const rewiredById=new Map<string,MioMeshFace>();
  for(const face of mesh.faces){
    const selectedEdgeId=faceToSelectedEdge.get(face.id);
    if(selectedEdgeId){
      const side=rail.faceSideByEdge.get(selectedEdgeId)?.get(face.id);
      if(side===undefined)throw new Error(`Interior bevel could not resolve side for face ${face.id}.`);
      rewiredById.set(face.id,{...structuredClone(face),vertexIds:face.vertexIds.map(id=>duplicates.get(id)?.[side]??id)});
    }else rewiredById.set(face.id,structuredClone(face));
  }

  for(const endpointId of endpointVertexIds){
    const rails=rail.railByVertex.get(endpointId)!;
    const pair=duplicates.get(endpointId)!;
    const sideFaces=endpointFarFaceSide.get(endpointId)!;
    for(const side of [0,1] as const){
      const faceId=sideFaces.get(side)!;
      const current=rewiredById.get(faceId)!;
      rewiredById.set(faceId,insertVertexOnDirectedEdge(current,endpointId,rails[side],pair[side]));
    }
  }

  const bevelFaces:MioMeshFace[]=[];
  for(const edgeId of rail.selectedEdgeIds){
    const edge=edgeById.get(edgeId)!;
    const sideMap=rail.faceSideByEdge.get(edgeId)!;
    const side0FaceId=[...sideMap.entries()].find(([,side])=>side===0)?.[0];
    const side1FaceId=[...sideMap.entries()].find(([,side])=>side===1)?.[0];
    if(!side0FaceId||!side1FaceId)throw new Error(`Interior bevel edge ${edgeId} could not resolve both sides.`);
    const side0Face=faceById.get(side0FaceId)!,side1Face=faceById.get(side1FaceId)!;
    let [start,end]=edge.vertexIds;
    const sign=directedEdgeSign(side0Face,start,end);
    if(sign===0)throw new Error(`Interior bevel face ${side0Face.id} does not contain edge ${edgeId}.`);
    if(sign<0)[start,end]=[end,start];
    if(directedEdgeSign(side1Face,start,end)!==-1)throw new Error(`Interior bevel incident faces have inconsistent winding at ${edgeId}.`);
    const sp=duplicates.get(start)!,ep=duplicates.get(end)!;
    const id=uniqueId(`${edgeId}_interior_bevel_face`,usedFaceIds);usedFaceIds.add(id);
    bevelFaces.push({id,vertexIds:[ep[0],sp[0],sp[1],ep[1]],...(side0Face.materialSlot===undefined?{}:{materialSlot:side0Face.materialSlot})});
  }

  const terminationFaces:MioMeshFace[]=[];
  for(const endpointId of endpointVertexIds){
    const pair=duplicates.get(endpointId)!;
    const id=uniqueId(`${endpointId}_interior_bevel_cap`,usedFaceIds);usedFaceIds.add(id);
    const candidates:[[string,string,string],[string,string,string]]=[[endpointId,pair[0],pair[1]],[endpointId,pair[1],pair[0]]];
    let accepted:MioMeshFace|null=null;
    for(const vertexIds of candidates){
      const candidate:MioMeshFace={id,vertexIds};
      const trial:MioMeshData={vertices:[...mesh.vertices.map(v=>structuredClone(v)),...createdVertices],faces:[...rewiredById.values(),...bevelFaces,...terminationFaces,candidate]};
      const d=diagnoseMeshTopology(trial);
      const capEdges=new Set([canonicalMeshEdgeId(endpointId,pair[0]),canonicalMeshEdgeId(endpointId,pair[1]),canonicalMeshEdgeId(pair[0],pair[1])]);
      if(!d.inconsistentWindingEdgeIds.some(edgeId=>capEdges.has(edgeId))){accepted=candidate;break}
    }
    if(!accepted)throw new Error(`Interior endpoint ${endpointId} could not orient a consistent termination cap.`);
    terminationFaces.push(accepted);
  }

  const interiorVertices=new Set(rail.selectedVertexIds.filter(id=>!endpointVertexIds.includes(id)));
  const result:MioMeshData={
    vertices:[...mesh.vertices.filter(v=>!interiorVertices.has(v.id)).map(v=>structuredClone(v)),...createdVertices],
    faces:[...rewiredById.values(),...bevelFaces,...terminationFaces],
  };
  ensureValid(result);
  if(result.faces.some(face=>face.vertexIds.some(id=>interiorVertices.has(id))))throw new Error('Interior bevel failed to remove internal path vertex references.');
  const diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Interior bevel produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Interior bevel produced inconsistent winding.');
  const resultEdges=deriveMeshEdges(result);
  for(const endpointId of endpointVertexIds){
    const pair=duplicates.get(endpointId)!;
    for(const id of pair){
      const edge=resultEdges.find(item=>item.id===canonicalMeshEdgeId(endpointId,id));
      if(!edge||edge.faceIds.length!==2)throw new Error(`Interior termination edge ${endpointId}<->${id} is not manifold.`);
    }
  }
  return{mesh:result,bevelFaceIds:bevelFaces.map(f=>f.id),terminationFaceIds:terminationFaces.map(f=>f.id),createdVertexIds:createdVertices.map(v=>v.id),removedVertexIds:[...interiorVertices],endpointVertexIds:[endpointVertexIds[0],endpointVertexIds[1]],widthRatio};
};
