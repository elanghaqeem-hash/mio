import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshEdgeSlideResult {
  mesh: MioMeshData;
  selectedEdgeIds: string[];
  movedVertexIds: string[];
  ratio: number;
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

const pointOnSegment=(point:MioMeshVertex,a:MioMeshVertex,b:MioMeshVertex,tolerance=1e-6):boolean=>{
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
  const projected:[
    number,number,number
  ]=[
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

export const slideMeshEdgeLoop=(mesh:MioMeshData,edgeIds:string[],ratio:number):MeshEdgeSlideResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw new Error('Edge Slide ratio must be greater than 0 and less than 1.');
  const selectedIds=[...new Set(edgeIds)];
  if(!selectedIds.length)throw new Error('Edge Slide requires at least one selected edge.');

  const allEdges=deriveMeshEdges(mesh);
  const edgeById=new Map(allEdges.map(edge=>[edge.id,edge]));
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const selectedEdges=selectedIds.map(id=>{
    const edge=edgeById.get(id);
    if(!edge)throw new Error(`Edge Slide selection contains missing edge ${id}.`);
    if(edge.faceIds.length!==2)throw new Error(`Edge Slide requires manifold selected edges; edge ${id} has ${edge.faceIds.length} incident face(s).`);
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
    if(neighbors.size<1||neighbors.size>2)throw new Error(`Edge Slide selection must form one path or loop; vertex ${vertexId} has selected degree ${neighbors.size}.`);
  }

  const visited=new Set<string>();
  const queue=[selectedVertexIds[0]];
  while(queue.length){
    const id=queue.shift()!;
    if(visited.has(id))continue;
    visited.add(id);
    for(const next of selectedAdjacency.get(id)??[])if(!visited.has(next))queue.push(next);
  }
  if(visited.size!==selectedVertexIds.length)throw new Error('Edge Slide selection must be one connected edge path or loop.');

  const railNeighbors=new Map<string,[string,string]>();
  for(const vertexId of selectedVertexIds){
    const rails=allEdges
      .filter(edge=>edge.vertexIds.includes(vertexId)&&!selectedEdgeSet.has(edge.id))
      .map(edge=>edge.vertexIds[0]===vertexId?edge.vertexIds[1]:edge.vertexIds[0])
      .filter(neighbor=>!selectedVertexSet.has(neighbor));
    const unique=[...new Set(rails)].sort((a,b)=>a.localeCompare(b));
    if(unique.length!==2)throw new Error(`Edge Slide vertex ${vertexId} requires exactly two rail neighbors; found ${unique.length}.`);
    railNeighbors.set(vertexId,[unique[0],unique[1]]);
  }

  const root=[...selectedVertexIds].sort((a,b)=>a.localeCompare(b))[0];
  const rootRails=railNeighbors.get(root)!;
  const sideLabels=new Map<string,[string,string]>([[root,[rootRails[0],rootRails[1]]]]);
  const propagate=[root];

  while(propagate.length){
    const current=propagate.shift()!;
    const labels=sideLabels.get(current)!;
    for(const neighbor of selectedAdjacency.get(current)??[]){
      const selectedEdge=selectedEdges.find(edge=>edge.vertexIds.includes(current)&&edge.vertexIds.includes(neighbor));
      if(!selectedEdge)throw new Error(`Could not resolve selected edge between ${current} and ${neighbor}.`);
      const pairs=selectedEdge.faceIds.map(faceId=>{
        const face=faceById.get(faceId);
        if(!face)throw new Error(`Selected edge references missing face ${faceId}.`);
        return{
          currentRail:faceRailNeighbor(face,current,neighbor),
          neighborRail:faceRailNeighbor(face,neighbor,current),
        };
      });
      const neighborBySide:[string|null,string|null]=[null,null];
      for(const pair of pairs){
        const side=labels[0]===pair.currentRail?0:labels[1]===pair.currentRail?1:-1;
        if(side<0)throw new Error(`Face rail ${pair.currentRail} is not a valid rail neighbor of ${current}.`);
        if(neighborBySide[side]&&neighborBySide[side]!==pair.neighborRail)throw new Error('Edge Slide rail-side mapping is contradictory.');
        neighborBySide[side]=pair.neighborRail;
      }
      if(!neighborBySide[0]||!neighborBySide[1])throw new Error(`Edge Slide could not map both rail sides across edge ${selectedEdge.id}.`);
      const candidate:[string,string]=[neighborBySide[0],neighborBySide[1]];
      const expectedRails=new Set(railNeighbors.get(neighbor));
      if(!expectedRails.has(candidate[0])||!expectedRails.has(candidate[1]))throw new Error(`Mapped rails do not match topology at vertex ${neighbor}.`);
      const existing=sideLabels.get(neighbor);
      if(existing){
        if(existing[0]!==candidate[0]||existing[1]!==candidate[1])throw new Error('Edge Slide side labels are inconsistent around the selected loop.');
      }else{
        sideLabels.set(neighbor,candidate);
        propagate.push(neighbor);
      }
    }
  }

  if(sideLabels.size!==selectedVertexIds.length)throw new Error('Edge Slide could not orient every selected vertex rail.');

  for(const vertexId of selectedVertexIds){
    const vertex=vertexById.get(vertexId)!;
    const rails=sideLabels.get(vertexId)!;
    const a=vertexById.get(rails[0])!;
    const b=vertexById.get(rails[1])!;
    if(!pointOnSegment(vertex,a,b))throw new Error(`Vertex ${vertexId} is not on its inferred rail segment; slide rejected.`);
  }

  const result:MioMeshData={
    vertices:mesh.vertices.map(vertex=>{
      const rails=sideLabels.get(vertex.id);
      if(!rails)return structuredClone(vertex);
      const a=vertexById.get(rails[0])!;
      const b=vertexById.get(rails[1])!;
      return{
        ...structuredClone(vertex),
        position:[
          a.position[0]+(b.position[0]-a.position[0])*ratio,
          a.position[1]+(b.position[1]-a.position[1])*ratio,
          a.position[2]+(b.position[2]-a.position[2])*ratio,
        ] as [number,number,number],
      };
    }),
    faces:mesh.faces.map(face=>structuredClone(face)),
  };
  ensureValid(result);
  return{
    mesh:result,
    selectedEdgeIds:[...selectedIds],
    movedVertexIds:[...selectedVertexIds].sort((a,b)=>a.localeCompare(b)),
    ratio,
    closed:[...selectedAdjacency.values()].every(neighbors=>neighbors.size===2),
  };
};
