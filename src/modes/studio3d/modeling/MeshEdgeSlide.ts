import type { MioMeshData } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { isVertexOnRailSegment, resolveMeshEdgeRailSelection } from './MeshEdgeRail';

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

export const slideMeshEdgeLoop=(mesh:MioMeshData,edgeIds:string[],ratio:number):MeshEdgeSlideResult=>{
  if(!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw new Error('Edge Slide ratio must be greater than 0 and less than 1.');
  const rail=resolveMeshEdgeRailSelection(mesh,edgeIds);
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));

  for(const vertexId of rail.selectedVertexIds){
    const vertex=vertexById.get(vertexId)!;
    const rails=rail.railByVertex.get(vertexId)!;
    const a=vertexById.get(rails[0])!;
    const b=vertexById.get(rails[1])!;
    if(!isVertexOnRailSegment(vertex,a,b))throw new Error(`Vertex ${vertexId} is not on its inferred rail segment; slide rejected.`);
  }

  const result:MioMeshData={
    vertices:mesh.vertices.map(vertex=>{
      const rails=rail.railByVertex.get(vertex.id);
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
    selectedEdgeIds:[...rail.selectedEdgeIds],
    movedVertexIds:[...rail.selectedVertexIds].sort((a,b)=>a.localeCompare(b)),
    ratio,
    closed:rail.closed,
  };
};
