import type { MioMeshData, MioMeshSelection } from '../../../types/creative';
import { meshSelectionVertexIds } from './MeshOperations';
import { meshSelectionPivot } from './MeshTransformTransaction';

export const rotateMeshSelection = (
  mesh:MioMeshData, selection:MioMeshSelection, rotation:[number,number,number],
):MioMeshData => {
  if(!rotation.every(Number.isFinite)) throw new Error('Mesh rotation must be finite.');
  const pivot=meshSelectionPivot(mesh,selection);
  if(!pivot)return structuredClone(mesh);
  const ids=new Set(meshSelectionVertexIds(mesh,selection));
  const [rx,ry,rz]=rotation; const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  return structuredClone(mesh).constructor === Object ? {
    ...structuredClone(mesh),
    vertices:mesh.vertices.map(v=>{
      if(!ids.has(v.id))return structuredClone(v);
      let x=v.position[0]-pivot[0],y=v.position[1]-pivot[1],z=v.position[2]-pivot[2];
      let ny=y*cx-z*sx,nz=y*sx+z*cx;y=ny;z=nz;
      let nx=x*cy+z*sy;nz=-x*sy+z*cy;x=nx;z=nz;
      nx=x*cz-y*sz;ny=x*sz+y*cz;x=nx;y=ny;
      return {...v,position:[x+pivot[0],y+pivot[1],z+pivot[2]] as [number,number,number]};
    }),
  } : structuredClone(mesh);
};

export const scaleMeshSelection = (
  mesh:MioMeshData, selection:MioMeshSelection, scale:[number,number,number],
):MioMeshData => {
  if(!scale.every(Number.isFinite))throw new Error('Mesh scale must be finite.');
  const pivot=meshSelectionPivot(mesh,selection);
  if(!pivot)return structuredClone(mesh);
  const ids=new Set(meshSelectionVertexIds(mesh,selection));
  return {
    ...structuredClone(mesh),
    vertices:mesh.vertices.map(v=>ids.has(v.id)?{...v,position:[
      pivot[0]+(v.position[0]-pivot[0])*scale[0],
      pivot[1]+(v.position[1]-pivot[1])*scale[1],
      pivot[2]+(v.position[2]-pivot[2])*scale[2],
    ] as [number,number,number]}:structuredClone(v)),
  };
};
