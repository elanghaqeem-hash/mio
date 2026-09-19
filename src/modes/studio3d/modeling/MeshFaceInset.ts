import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';

export interface MeshFaceInsetResult {
  mesh: MioMeshData;
  insetFaceId: string;
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

const centroid=(vertices:MioMeshVertex[]):[number,number,number]=>{
  const sum=vertices.reduce((acc,vertex)=>[
    acc[0]+vertex.position[0],
    acc[1]+vertex.position[1],
    acc[2]+vertex.position[2],
  ] as [number,number,number],[0,0,0]);
  return [sum[0]/vertices.length,sum[1]/vertices.length,sum[2]/vertices.length];
};

export const insetMeshFace=(
  mesh:MioMeshData,
  faceId:string,
  ratio:number,
):MeshFaceInsetResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw new Error('Inset ratio must be greater than 0 and less than 1.');
  const face=mesh.faces.find(candidate=>candidate.id===faceId);
  if(!face)throw new Error(`Mesh face ${faceId} does not exist.`);
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const sourceVertices=face.vertexIds.map(vertexId=>{
    const vertex=vertexById.get(vertexId);
    if(!vertex)throw new Error(`Face ${faceId} references missing vertex ${vertexId}.`);
    return vertex;
  });
  const center=centroid(sourceVertices);
  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(candidate=>candidate.id));
  const createdVertices:MioMeshVertex[]=[];
  const insetVertexIds:string[]=[];

  for(const source of sourceVertices){
    const id=uniqueId(`${source.id}_inset`,usedVertexIds);
    usedVertexIds.add(id);
    insetVertexIds.push(id);
    createdVertices.push({
      id,
      position:[
        source.position[0]+(center[0]-source.position[0])*ratio,
        source.position[1]+(center[1]-source.position[1])*ratio,
        source.position[2]+(center[2]-source.position[2])*ratio,
      ],
    });
  }

  const insetFaceId=uniqueId(`${face.id}_inset`,usedFaceIds);
  usedFaceIds.add(insetFaceId);
  const insetFace:MioMeshFace={...face,id:insetFaceId,vertexIds:insetVertexIds};
  const ringFaces:MioMeshFace[]=[];

  for(let index=0;index<face.vertexIds.length;index+=1){
    const next=(index+1)%face.vertexIds.length;
    const id=uniqueId(`${face.id}_inset_ring_${index+1}`,usedFaceIds);
    usedFaceIds.add(id);
    ringFaces.push({
      id,
      vertexIds:[
        face.vertexIds[index],
        face.vertexIds[next],
        insetVertexIds[next],
        insetVertexIds[index],
      ],
      ...(face.materialSlot===undefined?{}:{materialSlot:face.materialSlot}),
    });
  }

  const result:MioMeshData={
    vertices:[...mesh.vertices.map(vertex=>structuredClone(vertex)),...createdVertices],
    faces:[
      ...mesh.faces.filter(candidate=>candidate.id!==face.id).map(candidate=>structuredClone(candidate)),
      insetFace,
      ...ringFaces,
    ],
  };
  ensureValid(result);
  return{
    mesh:result,
    insetFaceId,
    createdVertexIds:createdVertices.map(vertex=>vertex.id),
    createdRingFaceIds:ringFaces.map(ring=>ring.id),
  };
};
