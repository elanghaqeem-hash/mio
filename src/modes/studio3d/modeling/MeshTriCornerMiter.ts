import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { analyzeBevelSelectionTopology } from './MeshBevelJunction';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';

type Vec3=[number,number,number];
export interface MeshTriCornerMiterResult {
  mesh:MioMeshData;
  junctionVertexId:string;
  createdVertexIds:string[];
  miterFaceIds:string[];
  removedVertexIds:string[];
  widthRatio:number;
}
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const unique=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i++;return `${base}_${i}`};
const edgeInFace=(face:MioMeshFace,a:string,b:string):boolean=>face.vertexIds.some((v,i)=>(v===a&&face.vertexIds[(i+1)%face.vertexIds.length]===b)||(v===b&&face.vertexIds[(i+1)%face.vertexIds.length]===a));

export const bevelTriCornerJunction=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshTriCornerMiterResult=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  if(!Number.isFinite(widthRatio)||widthRatio<=0||widthRatio>=0.5)throw new Error('Tri-corner width ratio must be greater than 0 and less than 0.5.');
  const analysis=analyzeBevelSelectionTopology(mesh,edgeIds);
  if(analysis.kind!=='junction-network'||analysis.junctions.length!==1||analysis.junctions[0].miterKind!=='tri-corner')throw new Error('Tri-Corner Miter requires exactly one degree-3 bevel junction.');
  const junction=analysis.junctions[0];
  if(analysis.selectedEdgeIds.length!==3||analysis.endpoints.length!==3)throw new Error('V4.0 Tri-Corner Miter supports exactly three selected edges terminating at one junction.');
  const vertexById=new Map(mesh.vertices.map(v=>[v.id,v]));
  const faceById=new Map(mesh.faces.map(f=>[f.id,f]));
  const edgeById=new Map(deriveMeshEdges(mesh).map(e=>[e.id,e]));
  const center=vertexById.get(junction.vertexId)!;
  const usedVertexIds=new Set(mesh.vertices.map(v=>v.id)),usedFaceIds=new Set(mesh.faces.map(f=>f.id));
  const neighborByEdge=new Map<string,string>();
  for(const edgeId of junction.incidentSelectedEdgeIds){
    const edge=edgeById.get(edgeId)!;
    const neighbor=edge.vertexIds.find(id=>id!==junction.vertexId);
    if(!neighbor)throw new Error(`Could not resolve tri-corner neighbor for ${edgeId}.`);
    neighborByEdge.set(edgeId,neighbor);
  }
  const junctionIncidentEdges=deriveMeshEdges(mesh).filter(edge=>edge.vertexIds.includes(junction.vertexId));
  if(junctionIncidentEdges.length!==3)throw new Error(`V4.0 requires a valence-3 source vertex; ${junction.vertexId} has valence ${junctionIncidentEdges.length}.`);
  const incidentFaces=mesh.faces.filter(face=>face.vertexIds.includes(junction.vertexId));
  if(incidentFaces.length!==3)throw new Error(`V4.0 requires exactly three faces around the tri-corner; found ${incidentFaces.length}.`);
  for(const face of incidentFaces){
    const touching=junction.incidentSelectedEdgeIds.filter(edgeId=>{const n=neighborByEdge.get(edgeId)!;return edgeInFace(face,junction.vertexId,n)});
    if(touching.length!==2)throw new Error(`Tri-corner face ${face.id} must be bounded by exactly two selected junction edges.`);
  }
  const materialSlots=new Set(incidentFaces.map(face=>face.materialSlot??0));
  if(materialSlots.size!==1)throw new Error('Tri-Corner Miter does not cross a material boundary.');

  const created:MioMeshVertex[]=[];
  const cutVertexByEdge=new Map<string,string>();
  for(const edgeId of junction.incidentSelectedEdgeIds){
    const neighborId=neighborByEdge.get(edgeId)!;
    const neighbor=vertexById.get(neighborId)!;
    const id=unique(`${junction.vertexId}_miter_${neighborId}`,usedVertexIds);usedVertexIds.add(id);
    cutVertexByEdge.set(edgeId,id);
    created.push({id,position:mix(center.position,neighbor.position,widthRatio)});
  }

  const replacementFaces:MioMeshFace[]=[];
  for(const face of mesh.faces){
    if(!face.vertexIds.includes(junction.vertexId)){replacementFaces.push(structuredClone(face));continue;}
    const previousIndex=(face.vertexIds.indexOf(junction.vertexId)-1+face.vertexIds.length)%face.vertexIds.length;
    const nextIndex=(face.vertexIds.indexOf(junction.vertexId)+1)%face.vertexIds.length;
    const previous=face.vertexIds[previousIndex],next=face.vertexIds[nextIndex];
    const prevCut=cutVertexByEdge.get(canonicalMeshEdgeId(junction.vertexId,previous));
    const nextCut=cutVertexByEdge.get(canonicalMeshEdgeId(junction.vertexId,next));
    if(!prevCut||!nextCut)throw new Error(`Tri-corner face ${face.id} could not resolve both cut vertices.`);
    const ids:string[]=[];
    for(const id of face.vertexIds){if(id===junction.vertexId)ids.push(nextCut,prevCut);else ids.push(id);}
    replacementFaces.push({...structuredClone(face),vertexIds:ids});
  }

  const orderedCutIds:string[]=[];
  const firstFace=incidentFaces[0];
  const centerIndex=firstFace.vertexIds.indexOf(junction.vertexId);
  const firstNext=firstFace.vertexIds[(centerIndex+1)%firstFace.vertexIds.length];
  let currentEdge=canonicalMeshEdgeId(junction.vertexId,firstNext);
  orderedCutIds.push(cutVertexByEdge.get(currentEdge)!);
  while(orderedCutIds.length<3){
    const currentNeighbor=neighborByEdge.get(currentEdge)!;
    const candidateFace=incidentFaces.find(face=>edgeInFace(face,junction.vertexId,currentNeighbor)&&face!==firstFace);
    const sourceFace=candidateFace??incidentFaces.find(face=>edgeInFace(face,junction.vertexId,currentNeighbor));
    if(!sourceFace)break;
    const otherEdge=junction.incidentSelectedEdgeIds.find(id=>id!==currentEdge&&edgeInFace(sourceFace,junction.vertexId,neighborByEdge.get(id)!));
    if(!otherEdge)break;
    const cutId=cutVertexByEdge.get(otherEdge)!;
    if(orderedCutIds.includes(cutId))break;
    orderedCutIds.push(cutId);currentEdge=otherEdge;
  }
  if(orderedCutIds.length!==3)throw new Error('Tri-corner miter could not derive a stable cap cycle.');
  const miterId=unique(`${junction.vertexId}_tri_miter`,usedFaceIds);
  const miterFace:MioMeshFace={id:miterId,vertexIds:orderedCutIds,...(firstFace.materialSlot===undefined?{}:{materialSlot:firstFace.materialSlot})};
  let result:MioMeshData={vertices:[...mesh.vertices.filter(v=>v.id!==junction.vertexId).map(v=>structuredClone(v)),...created],faces:[...replacementFaces,miterFace]};
  let diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.inconsistentWindingEdgeIds.length){
    result={...result,faces:result.faces.map(face=>face.id===miterId?{...face,vertexIds:[...face.vertexIds].reverse()}:face)};
    diagnostics=diagnoseMeshTopology(result);
  }
  const finalValidation=validateMeshTopology(result);
  if(!finalValidation.valid)throw new Error(`Tri-corner miter produced invalid topology: ${finalValidation.errors.join(' ')}`);
  if(diagnostics.boundaryEdgeIds.length)throw new Error('Tri-corner miter produced an open boundary.');
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Tri-corner miter produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Tri-corner miter produced inconsistent winding.');
  if(diagnostics.zeroAreaFaceIds.length)throw new Error('Tri-corner miter produced zero-area geometry.');
  return{mesh:result,junctionVertexId:junction.vertexId,createdVertexIds:created.map(v=>v.id),miterFaceIds:[miterId],removedVertexIds:[junction.vertexId],widthRatio};
};
