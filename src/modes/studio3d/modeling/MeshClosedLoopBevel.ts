import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { isVertexOnRailSegment, railParameter, resolveMeshEdgeRailSelection } from './MeshEdgeRail';

export interface MeshClosedLoopBevelResult {
  mesh: MioMeshData;
  bevelFaceIds: string[];
  createdVertexIds: string[];
  side0LoopEdgeIds: string[];
  side1LoopEdgeIds: string[];
  removedVertexIds: string[];
  widthRatio: number;
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

const directedEdgeSign=(face:MioMeshFace,a:string,b:string):number=>{
  for(let index=0;index<face.vertexIds.length;index+=1){
    const current=face.vertexIds[index];
    const next=face.vertexIds[(index+1)%face.vertexIds.length];
    if(current===a&&next===b)return 1;
    if(current===b&&next===a)return -1;
  }
  return 0;
};

const interpolate=(a:MioMeshVertex,b:MioMeshVertex,t:number):[number,number,number]=>[
  a.position[0]+(b.position[0]-a.position[0])*t,
  a.position[1]+(b.position[1]-a.position[1])*t,
  a.position[2]+(b.position[2]-a.position[2])*t,
];

export const bevelClosedEdgeLoop=(
  mesh:MioMeshData,
  edgeIds:string[],
  widthRatio:number,
):MeshClosedLoopBevelResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(widthRatio)||widthRatio<=0||widthRatio>=0.5)throw new Error('Bevel width ratio must be greater than 0 and less than 0.5.');
  const rail=resolveMeshEdgeRailSelection(mesh,edgeIds,true);
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const edgeById=new Map(deriveMeshEdges(mesh).map(edge=>[edge.id,edge]));
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const selectedVertexSet=new Set(rail.selectedVertexIds);
  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(face=>face.id));
  const duplicates=new Map<string,[string,string]>();
  const createdVertices:MioMeshVertex[]=[];

  for(const vertexId of rail.selectedVertexIds){
    const vertex=vertexById.get(vertexId)!;
    const rails=rail.railByVertex.get(vertexId)!;
    const side0=vertexById.get(rails[0])!;
    const side1=vertexById.get(rails[1])!;
    if(!isVertexOnRailSegment(vertex,side0,side1))throw new Error(`Bevel vertex ${vertexId} is not on its inferred rail segment.`);
    const t=railParameter(vertex,side0,side1);
    if(t-widthRatio<=1e-6||t+widthRatio>=1-1e-6)throw new Error(`Bevel width ${widthRatio} exceeds available rail space at vertex ${vertexId}.`);
    const id0=uniqueId(`${vertexId}_bevel_0`,usedVertexIds);
    usedVertexIds.add(id0);
    const id1=uniqueId(`${vertexId}_bevel_1`,usedVertexIds);
    usedVertexIds.add(id1);
    duplicates.set(vertexId,[id0,id1]);
    createdVertices.push({id:id0,position:interpolate(side0,side1,t-widthRatio)});
    createdVertices.push({id:id1,position:interpolate(side0,side1,t+widthRatio)});
  }

  const faceToSelectedEdges=new Map<string,string[]>();
  for(const edgeId of rail.selectedEdgeIds){
    const edge=edgeById.get(edgeId);
    if(!edge)throw new Error(`Bevel selection contains missing edge ${edgeId}.`);
    if(edge.faceIds.length!==2)throw new Error(`Bevel requires manifold edge ${edgeId}.`);
    const incidentFaces=edge.faceIds.map(faceId=>{
      const face=faceById.get(faceId);
      if(!face)throw new Error(`Bevel edge ${edgeId} references missing face ${faceId}.`);
      return face;
    });
    if((incidentFaces[0].materialSlot??0)!==(incidentFaces[1].materialSlot??0))throw new Error(`Bevel does not cross material boundary on edge ${edgeId}.`);
    for(const face of incidentFaces){
      const list=faceToSelectedEdges.get(face.id)??[];
      list.push(edgeId);
      faceToSelectedEdges.set(face.id,list);
    }
  }

  for(const [faceId,selectedEdges] of faceToSelectedEdges){
    if(selectedEdges.length!==1)throw new Error(`Closed-loop bevel currently requires each adjacent face to touch exactly one selected edge; face ${faceId} touches ${selectedEdges.length}.`);
  }
  for(const face of mesh.faces){
    if(face.vertexIds.some(vertexId=>selectedVertexSet.has(vertexId))&&!faceToSelectedEdges.has(face.id)){
      throw new Error(`Face ${face.id} references a bevel-loop vertex without containing a selected loop edge.`);
    }
  }

  const rewiredFaces:MioMeshFace[]=mesh.faces.map(face=>{
    const selectedEdges=faceToSelectedEdges.get(face.id);
    if(!selectedEdges)return structuredClone(face);
    const edgeId=selectedEdges[0];
    const side=rail.faceSideByEdge.get(edgeId)?.get(face.id);
    if(side===undefined)throw new Error(`Bevel could not resolve face side for ${face.id}.`);
    return{
      ...structuredClone(face),
      vertexIds:face.vertexIds.map(vertexId=>{
        const pair=duplicates.get(vertexId);
        return pair?pair[side]:vertexId;
      }),
    };
  });

  const bevelFaces:MioMeshFace[]=[];
  for(const edgeId of rail.selectedEdgeIds){
    const edge=edgeById.get(edgeId)!;
    const sideMap=rail.faceSideByEdge.get(edgeId)!;
    const side0FaceId=[...sideMap.entries()].find(([,side])=>side===0)?.[0];
    const side1FaceId=[...sideMap.entries()].find(([,side])=>side===1)?.[0];
    if(!side0FaceId||!side1FaceId)throw new Error(`Bevel edge ${edgeId} could not resolve both side faces.`);
    const side0Face=faceById.get(side0FaceId)!;
    const side1Face=faceById.get(side1FaceId)!;
    const [u,v]=edge.vertexIds;
    let start=u,end=v;
    const sign=directedEdgeSign(side0Face,u,v);
    if(sign===0)throw new Error(`Bevel side face ${side0Face.id} does not contain edge ${edgeId}.`);
    if(sign<0){start=v;end=u;}
    if(directedEdgeSign(side1Face,start,end)!==-1)throw new Error(`Bevel incident faces do not have opposite winding across edge ${edgeId}.`);
    const startPair=duplicates.get(start)!;
    const endPair=duplicates.get(end)!;
    const id=uniqueId(`${edgeId}_bevel_face`,usedFaceIds);
    usedFaceIds.add(id);
    bevelFaces.push({
      id,
      vertexIds:[endPair[0],startPair[0],startPair[1],endPair[1]],
      ...(side0Face.materialSlot===undefined?{}:{materialSlot:side0Face.materialSlot}),
    });
  }

  const result:MioMeshData={
    vertices:[
      ...mesh.vertices.filter(vertex=>!selectedVertexSet.has(vertex.id)).map(vertex=>structuredClone(vertex)),
      ...createdVertices,
    ],
    faces:[...rewiredFaces,...bevelFaces],
  };
  ensureValid(result);
  if(result.faces.some(face=>face.vertexIds.some(vertexId=>selectedVertexSet.has(vertexId)))){
    throw new Error('Bevel failed to remove all references to original loop vertices.');
  }
  const diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Bevel produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Bevel produced inconsistent winding.');

  const side0Vertices=new Set([...duplicates.values()].map(pair=>pair[0]));
  const side1Vertices=new Set([...duplicates.values()].map(pair=>pair[1]));
  const resultEdges=deriveMeshEdges(result);
  const side0LoopEdgeIds=resultEdges.filter(edge=>edge.vertexIds.every(id=>side0Vertices.has(id))).map(edge=>edge.id);
  const side1LoopEdgeIds=resultEdges.filter(edge=>edge.vertexIds.every(id=>side1Vertices.has(id))).map(edge=>edge.id);

  return{
    mesh:result,
    bevelFaceIds:bevelFaces.map(face=>face.id),
    createdVertexIds:createdVertices.map(vertex=>vertex.id),
    side0LoopEdgeIds,
    side1LoopEdgeIds,
    removedVertexIds:[...rail.selectedVertexIds],
    widthRatio,
  };
};
