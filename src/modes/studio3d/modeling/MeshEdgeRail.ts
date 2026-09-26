import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshEdgeRailSelection {
  selectedEdgeIds: string[];
  selectedVertexIds: string[];
  selectedAdjacency: Map<string, Set<string>>;
  railByVertex: Map<string, [string, string]>;
  faceSideByEdge: Map<string, Map<string, 0 | 1>>;
  closed: boolean;
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const faceRailNeighbor=(face:MioMeshFace,vertexId:string,partnerId:string):string=>{
  const index=face.vertexIds.indexOf(vertexId);
  if(index<0)throw new Error(`Face ${face.id} does not contain selected vertex ${vertexId}.`);
  const previous=face.vertexIds[(index-1+face.vertexIds.length)%face.vertexIds.length];
  const next=face.vertexIds[(index+1)%face.vertexIds.length];
  if(previous===partnerId)return next;
  if(next===partnerId)return previous;
  throw new Error(`Selected edge ${vertexId}<->${partnerId} is not consecutive on face ${face.id}.`);
};

export const isVertexOnRailSegment=(point:MioMeshVertex,a:MioMeshVertex,b:MioMeshVertex,tolerance=1e-6):boolean=>{
  const ab:[number,number,number]=[
    b.position[0]-a.position[0],
    b.position[1]-a.position[1],
    b.position[2]-a.position[2],
  ];
  const ap:[number,number,number]=[
    point.position[0]-a.position[0],
    point.position[1]-a.position[1],
    point.position[2]-a.position[2],
  ];
  const lengthSq=ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2];
  if(lengthSq<=Number.EPSILON)return false;
  const t=(ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/lengthSq;
  if(t<-tolerance||t>1+tolerance)return false;
  const projected:[number,number,number]=[
    a.position[0]+ab[0]*t,
    a.position[1]+ab[1]*t,
    a.position[2]+ab[2]*t,
  ];
  const distance=Math.hypot(
    point.position[0]-projected[0],
    point.position[1]-projected[1],
    point.position[2]-projected[2],
  );
  return distance<=tolerance*Math.max(1,Math.sqrt(lengthSq));
};

export const railParameter=(point:MioMeshVertex,a:MioMeshVertex,b:MioMeshVertex):number=>{
  const ab:[number,number,number]=[
    b.position[0]-a.position[0],
    b.position[1]-a.position[1],
    b.position[2]-a.position[2],
  ];
  const ap:[number,number,number]=[
    point.position[0]-a.position[0],
    point.position[1]-a.position[1],
    point.position[2]-a.position[2],
  ];
  const lengthSq=ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2];
  if(lengthSq<=Number.EPSILON)throw new Error('Cannot resolve rail parameter on a zero-length rail.');
  return (ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/lengthSq;
};

export const resolveMeshEdgeRailSelection=(
  mesh:MioMeshData,
  edgeIds:string[],
  requireClosed=false,
):MeshEdgeRailSelection=>{
  ensureValid(mesh);
  const selectedIds=[...new Set(edgeIds)];
  if(!selectedIds.length)throw new Error('Rail selection requires at least one selected edge.');

  const allEdges=deriveMeshEdges(mesh);
  const edgeById=new Map(allEdges.map(edge=>[edge.id,edge]));
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const selectedEdges=selectedIds.map(id=>{
    const edge=edgeById.get(id);
    if(!edge)throw new Error(`Rail selection contains missing edge ${id}.`);
    if(edge.faceIds.length!==2)throw new Error(`Rail selection requires manifold selected edges; edge ${id} has ${edge.faceIds.length} incident face(s).`);
    return edge;
  });
  const selectedEdgeSet=new Set(selectedIds);
  const selectedVertexIds=[...new Set(selectedEdges.flatMap(edge=>edge.vertexIds))];
  const selectedVertexSet=new Set(selectedVertexIds);

  const selectedAdjacency=new Map(selectedVertexIds.map(id=>[id,new Set<string>()]));
  for(const edge of selectedEdges){
    const [a,b]=edge.vertexIds;
    selectedAdjacency.get(a)?.add(b);
    selectedAdjacency.get(b)?.add(a);
  }
  for(const [vertexId,neighbors] of selectedAdjacency){
    if(neighbors.size<1||neighbors.size>2)throw new Error(`Rail selection must form one path or loop; vertex ${vertexId} has selected degree ${neighbors.size}.`);
  }

  const visited=new Set<string>();
  const queue=[selectedVertexIds[0]];
  while(queue.length){
    const id=queue.shift()!;
    if(visited.has(id))continue;
    visited.add(id);
    for(const next of selectedAdjacency.get(id)??[])if(!visited.has(next))queue.push(next);
  }
  if(visited.size!==selectedVertexIds.length)throw new Error('Rail selection must be one connected edge path or loop.');

  const closed=[...selectedAdjacency.values()].every(neighbors=>neighbors.size===2);
  if(requireClosed&&!closed)throw new Error('This operation requires one closed selected edge loop.');

  const railNeighbors=new Map<string,[string,string]>();
  for(const vertexId of selectedVertexIds){
    const selectedPartners=[...(selectedAdjacency.get(vertexId)??[])];
    let unique:string[];
    if(!closed&&selectedPartners.length===1){
      const selectedEdge=selectedEdges.find(edge=>edge.vertexIds.includes(vertexId)&&edge.vertexIds.includes(selectedPartners[0]));
      if(!selectedEdge)throw new Error(`Could not resolve endpoint selected edge at ${vertexId}.`);
      const endpointRails=selectedEdge.faceIds.map(faceId=>{
        const face=faceById.get(faceId);
        if(!face)throw new Error(`Endpoint selected edge references missing face ${faceId}.`);
        return faceRailNeighbor(face,vertexId,selectedPartners[0]);
      });
      unique=[...new Set(endpointRails)].sort((a,b)=>a.localeCompare(b));
    }else{
      const rails=allEdges
        .filter(edge=>edge.vertexIds.includes(vertexId)&&!selectedEdgeSet.has(edge.id))
        .map(edge=>edge.vertexIds[0]===vertexId?edge.vertexIds[1]:edge.vertexIds[0])
        .filter(neighbor=>!selectedVertexSet.has(neighbor));
      unique=[...new Set(rails)].sort((a,b)=>a.localeCompare(b));
    }
    if(unique.length!==2)throw new Error(`Rail vertex ${vertexId} requires exactly two side rail neighbors; found ${unique.length}.`);
    railNeighbors.set(vertexId,[unique[0],unique[1]]);
  }

  const root=[...selectedVertexIds].sort((a,b)=>a.localeCompare(b))[0];
  const rootRails=railNeighbors.get(root)!;
  const railByVertex=new Map<string,[string,string]>([[root,[rootRails[0],rootRails[1]]]]);
  const faceSideByEdge=new Map<string,Map<string,0|1>>();
  const propagate=[root];

  while(propagate.length){
    const current=propagate.shift()!;
    const labels=railByVertex.get(current)!;
    for(const neighbor of selectedAdjacency.get(current)??[]){
      const selectedEdge=selectedEdges.find(edge=>edge.vertexIds.includes(current)&&edge.vertexIds.includes(neighbor));
      if(!selectedEdge)throw new Error(`Could not resolve selected edge between ${current} and ${neighbor}.`);
      const neighborBySide:[string|null,string|null]=[null,null];
      const sideMap=faceSideByEdge.get(selectedEdge.id)??new Map<string,0|1>();
      for(const faceId of selectedEdge.faceIds){
        const face=faceById.get(faceId);
        if(!face)throw new Error(`Selected edge references missing face ${faceId}.`);
        const currentRail=faceRailNeighbor(face,current,neighbor);
        const neighborRail=faceRailNeighbor(face,neighbor,current);
        let side:0|1;
        if(labels[0]===currentRail)side=0;
        else if(labels[1]===currentRail)side=1;
        else throw new Error(`Face rail ${currentRail} is not a valid rail neighbor of ${current}.`);
        if(neighborBySide[side]&&neighborBySide[side]!==neighborRail)throw new Error('Rail-side mapping is contradictory.');
        neighborBySide[side]=neighborRail;
        const existingSide=sideMap.get(faceId);
        if(existingSide!==undefined&&existingSide!==side)throw new Error('Face-side assignment is contradictory.');
        sideMap.set(faceId,side);
      }
      faceSideByEdge.set(selectedEdge.id,sideMap);
      if(!neighborBySide[0]||!neighborBySide[1])throw new Error(`Could not map both rail sides across edge ${selectedEdge.id}.`);
      const candidate:[string,string]=[neighborBySide[0],neighborBySide[1]];
      const expectedRails=new Set(railNeighbors.get(neighbor));
      if(!expectedRails.has(candidate[0])||!expectedRails.has(candidate[1]))throw new Error(`Mapped rails do not match topology at vertex ${neighbor}.`);
      const existing=railByVertex.get(neighbor);
      if(existing){
        if(existing[0]!==candidate[0]||existing[1]!==candidate[1])throw new Error('Rail labels are inconsistent around the selected loop.');
      }else{
        railByVertex.set(neighbor,candidate);
        propagate.push(neighbor);
      }
    }
  }

  if(railByVertex.size!==selectedVertexIds.length)throw new Error('Could not orient every selected vertex rail.');
  for(const edge of selectedEdges){
    const sideMap=faceSideByEdge.get(edge.id);
    if(!sideMap||sideMap.size!==2)throw new Error(`Could not resolve both incident face sides for edge ${edge.id}.`);
  }

  return{
    selectedEdgeIds:selectedIds,
    selectedVertexIds,
    selectedAdjacency,
    railByVertex,
    faceSideByEdge,
    closed,
  };
};
