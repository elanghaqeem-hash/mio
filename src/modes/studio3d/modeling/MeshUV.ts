import type { MioMeshData, MioMeshFace, MioUVCoordinate } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export type MeshUVProjectionAxis='x'|'y'|'z';
const EPSILON=1e-10;

const bounds=(mesh:MioMeshData,axis:0|1|2):[number,number]=>{
  if(!mesh.vertices.length)throw new Error('UV unwrap requires at least one mesh vertex.');
  const values=mesh.vertices.map(vertex=>vertex.position[axis]);
  return[Math.min(...values),Math.max(...values)];
};
const normalize=(value:number,min:number,max:number):number=>{
  const range=max-min;
  if(!Number.isFinite(range)||Math.abs(range)<=EPSILON)throw new Error('UV projection axis has zero usable range.');
  return(value-min)/range;
};
const projectionAxes=(axis:MeshUVProjectionAxis):[0|1|2,0|1|2]=>axis==='x'?[1,2]:axis==='y'?[0,2]:[0,1];
const faceNormal=(face:MioMeshFace,positions:Map<string,[number,number,number]>):[number,number,number]=>{
  let x=0,y=0,z=0;
  for(let index=0;index<face.vertexIds.length;index+=1){
    const current=positions.get(face.vertexIds[index]);
    const next=positions.get(face.vertexIds[(index+1)%face.vertexIds.length]);
    if(!current||!next)throw new Error(`Cannot compute UV normal for face ${face.id}.`);
    x+=(current[1]-next[1])*(current[2]+next[2]);
    y+=(current[2]-next[2])*(current[0]+next[0]);
    z+=(current[0]-next[0])*(current[1]+next[1]);
  }
  return[x,y,z];
};
const dominantAxis=(normal:[number,number,number]):MeshUVProjectionAxis=>{
  const values=normal.map(Math.abs);
  if(values[0]<=EPSILON&&values[1]<=EPSILON&&values[2]<=EPSILON)throw new Error('Cube UV unwrap cannot project a zero-area face.');
  return values[0]>=values[1]&&values[0]>=values[2]?'x':values[1]>=values[2]?'y':'z';
};

export const meshHasCompleteUVs=(mesh:MioMeshData):boolean=>
  mesh.faces.length>0&&mesh.faces.every(face=>Boolean(face.uvs)&&face.uvs!.length===face.vertexIds.length&&face.uvs!.every(uv=>uv.length===2&&uv.every(Number.isFinite)));

export const unwrapMeshPlanar=(mesh:MioMeshData,axis:MeshUVProjectionAxis):MioMeshData=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Cannot unwrap invalid mesh: ${validation.errors.join(' ')}`);
  const [uAxis,vAxis]=projectionAxes(axis),[uMin,uMax]=bounds(mesh,uAxis),[vMin,vMax]=bounds(mesh,vAxis);
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex.position] as const));
  const result=structuredClone(mesh);
  result.faces=result.faces.map(face=>({...face,uvs:face.vertexIds.map(id=>{
    const position=vertexById.get(id);
    if(!position)throw new Error(`Face ${face.id} references missing vertex ${id}.`);
    return[normalize(position[uAxis],uMin,uMax),normalize(position[vAxis],vMin,vMax)] as MioUVCoordinate;
  })}));
  return result;
};

export const unwrapMeshCube=(mesh:MioMeshData):MioMeshData=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Cannot unwrap invalid mesh: ${validation.errors.join(' ')}`);
  const positionById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex.position] as const));
  const axisBounds:{x:[[number,number],[number,number]];y:[[number,number],[number,number]];z:[[number,number],[number,number]]}={
    x:[bounds(mesh,1),bounds(mesh,2)],
    y:[bounds(mesh,0),bounds(mesh,2)],
    z:[bounds(mesh,0),bounds(mesh,1)],
  };
  const result=structuredClone(mesh);
  result.faces=result.faces.map(face=>{
    const axis=dominantAxis(faceNormal(face,positionById));
    const [uAxis,vAxis]=projectionAxes(axis),[[uMin,uMax],[vMin,vMax]]=axisBounds[axis];
    const uvs=face.vertexIds.map(id=>{
      const position=positionById.get(id);
      if(!position)throw new Error(`Face ${face.id} references missing vertex ${id}.`);
      return[normalize(position[uAxis],uMin,uMax),normalize(position[vAxis],vMin,vMax)] as MioUVCoordinate;
    });
    return{...face,uvs};
  });
  return result;
};

const uvForVertex=(face:MioMeshFace,vertexId:string):MioUVCoordinate|null=>{
  if(!face.uvs)return null;
  const index=face.vertexIds.indexOf(vertexId);
  return index>=0?face.uvs[index]??null:null;
};
const sameUv=(left:MioUVCoordinate,right:MioUVCoordinate):boolean=>
  Math.abs(left[0]-right[0])<=EPSILON&&Math.abs(left[1]-right[1])<=EPSILON;

export const deriveUVSeamEdgeIds=(mesh:MioMeshData):string[]=>{
  if(!meshHasCompleteUVs(mesh))return[];
  const faceById=new Map(mesh.faces.map(face=>[face.id,face] as const));
  const seams:string[]=[];
  for(const edge of deriveMeshEdges(mesh)){
    if(edge.faceIds.length!==2)continue;
    const first=faceById.get(edge.faceIds[0]),second=faceById.get(edge.faceIds[1]);
    if(!first||!second)continue;
    const [a,b]=edge.vertexIds;
    const firstA=uvForVertex(first,a),firstB=uvForVertex(first,b),secondA=uvForVertex(second,a),secondB=uvForVertex(second,b);
    if(!firstA||!firstB||!secondA||!secondB)continue;
    if(!sameUv(firstA,secondA)||!sameUv(firstB,secondB))seams.push(edge.id);
  }
  return seams.sort((a,b)=>a.localeCompare(b));
};
