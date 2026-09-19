import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshRegionExtrudeResult {
  mesh: MioMeshData;
  capFaceIds: string[];
  createdVertexIds: string[];
  createdSideFaceIds: string[];
}

const ensureValid = (mesh: MioMeshData): void => {
  const validation = validateMeshTopology(mesh);
  if (!validation.valid) throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const uniqueId = (base: string, used: Set<string>): string => {
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
};

const faceNormal = (face: MioMeshFace, vertexById: Map<string, MioMeshVertex>): [number, number, number] => {
  let x=0,y=0,z=0;
  for(let i=0;i<face.vertexIds.length;i+=1){
    const current=vertexById.get(face.vertexIds[i]);
    const next=vertexById.get(face.vertexIds[(i+1)%face.vertexIds.length]);
    if(!current||!next)throw new Error(`Face ${face.id} references a missing vertex.`);
    x+=(current.position[1]-next.position[1])*(current.position[2]+next.position[2]);
    y+=(current.position[2]-next.position[2])*(current.position[0]+next.position[0]);
    z+=(current.position[0]-next.position[0])*(current.position[1]+next.position[1]);
  }
  const length=Math.hypot(x,y,z);
  if(length<=Number.EPSILON)throw new Error(`Face ${face.id} is degenerate.`);
  return [x/length,y/length,z/length];
};

const regionNormal = (faces: MioMeshFace[], vertexById: Map<string, MioMeshVertex>): [number, number, number] => {
  const sum=faces.reduce((acc,face)=>{
    const n=faceNormal(face,vertexById);
    return [acc[0]+n[0],acc[1]+n[1],acc[2]+n[2]] as [number,number,number];
  },[0,0,0] as [number,number,number]);
  const length=Math.hypot(...sum);
  if(length<=Number.EPSILON)throw new Error('Selected face region has no stable extrusion direction.');
  return [sum[0]/length,sum[1]/length,sum[2]/length];
};

export const extrudeMeshRegion = (
  mesh: MioMeshData,
  faceIds: string[],
  distance: number,
): MeshRegionExtrudeResult => {
  ensureValid(mesh);
  if(!Number.isFinite(distance)||Math.abs(distance)<=Number.EPSILON)throw new Error('Region extrude distance must be a non-zero finite number.');
  const selectedSet=new Set(faceIds);
  const selectedFaces=mesh.faces.filter(face=>selectedSet.has(face.id));
  if(!selectedFaces.length)throw new Error('Region extrude requires at least one valid selected face.');
  if(selectedFaces.length!==selectedSet.size)throw new Error('Region extrude selection contains missing face IDs.');

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const normal=regionNormal(selectedFaces,vertexById);
  const selectedVertexIds=[...new Set(selectedFaces.flatMap(face=>face.vertexIds))];
  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(face=>face.id));
  const duplicateBySource=new Map<string,string>();
  const createdVertices:MioMeshVertex[]=[];

  for(const sourceId of selectedVertexIds){
    const source=vertexById.get(sourceId);
    if(!source)throw new Error(`Selected region references missing vertex ${sourceId}.`);
    const id=uniqueId(`${sourceId}_region`,usedVertexIds);
    usedVertexIds.add(id);
    duplicateBySource.set(sourceId,id);
    createdVertices.push({
      id,
      position:[
        source.position[0]+normal[0]*distance,
        source.position[1]+normal[1]*distance,
        source.position[2]+normal[2]*distance,
      ],
    });
  }

  const capFaces:MioMeshFace[]=selectedFaces.map(face=>{
    const id=uniqueId(`${face.id}_cap`,usedFaceIds);
    usedFaceIds.add(id);
    return { ...face, id, vertexIds:face.vertexIds.map(vertexId=>duplicateBySource.get(vertexId)!) };
  });

  const selectedEdges=deriveMeshEdges(mesh).filter(edge=>edge.faceIds.some(faceId=>selectedSet.has(faceId)));
  const boundaryEdges=selectedEdges.filter(edge=>edge.faceIds.filter(faceId=>selectedSet.has(faceId)).length===1);
  const sideFaces:MioMeshFace[]=[];

  for(const edge of boundaryEdges){
    const [a,b]=edge.vertexIds;
    const da=duplicateBySource.get(a);
    const db=duplicateBySource.get(b);
    if(!da||!db)throw new Error(`Boundary edge ${edge.id} could not map to duplicated region vertices.`);
    const id=uniqueId(`region_side_${a}_${b}`,usedFaceIds);
    usedFaceIds.add(id);
    sideFaces.push({id,vertexIds:[a,b,db,da]});
  }

  const result:MioMeshData={
    vertices:[...mesh.vertices.map(vertex=>structuredClone(vertex)),...createdVertices],
    faces:[
      ...mesh.faces.filter(face=>!selectedSet.has(face.id)).map(face=>structuredClone(face)),
      ...capFaces,
      ...sideFaces,
    ],
  };
  ensureValid(result);
  return {
    mesh:result,
    capFaceIds:capFaces.map(face=>face.id),
    createdVertexIds:createdVertices.map(vertex=>vertex.id),
    createdSideFaceIds:sideFaces.map(face=>face.id),
  };
};
