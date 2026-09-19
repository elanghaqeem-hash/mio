import { Vector2, Vector3, type Camera, type Object3D } from 'three';
import type { MioMeshData } from '../../../types/creative';
import { deriveMeshEdges } from './MeshTopology';

export interface ScreenPickResult { id:string; distancePx:number }

const projectLocal = (position:[number,number,number], object:Object3D, camera:Camera, width:number, height:number):Vector2 => {
  const world = object.localToWorld(new Vector3(...position));
  world.project(camera);
  return new Vector2((world.x + 1) * 0.5 * width, (1 - world.y) * 0.5 * height);
};

export const pickMeshVertexScreenSpace = (
  mesh:MioMeshData, object:Object3D, camera:Camera, pointer:Vector2, width:number, height:number, thresholdPx=12,
):ScreenPickResult|null => {
  object.updateWorldMatrix(true,false);
  camera.updateWorldMatrix(true,false);
  let best:ScreenPickResult|null=null;
  for(const vertex of mesh.vertices){
    const screen=projectLocal(vertex.position,object,camera,width,height);
    const distancePx=screen.distanceTo(pointer);
    if(distancePx<=thresholdPx && (!best || distancePx<best.distancePx)) best={id:vertex.id,distancePx};
  }
  return best;
};

const distanceToSegment=(p:Vector2,a:Vector2,b:Vector2):number=>{
  const ab=b.clone().sub(a); const lengthSq=ab.lengthSq();
  if(lengthSq===0)return p.distanceTo(a);
  const t=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/lengthSq));
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
};

export const pickMeshEdgeScreenSpace = (
  mesh:MioMeshData, object:Object3D, camera:Camera, pointer:Vector2, width:number, height:number, thresholdPx=8,
):ScreenPickResult|null => {
  object.updateWorldMatrix(true,false);
  camera.updateWorldMatrix(true,false);
  const vertices=new Map(mesh.vertices.map(v=>[v.id,v.position]));
  let best:ScreenPickResult|null=null;
  for(const edge of deriveMeshEdges(mesh)){
    const pa=vertices.get(edge.vertexIds[0]); const pb=vertices.get(edge.vertexIds[1]);
    if(!pa||!pb)continue;
    const distancePx=distanceToSegment(pointer,projectLocal(pa,object,camera,width,height),projectLocal(pb,object,camera,width,height));
    if(distancePx<=thresholdPx && (!best || distancePx<best.distancePx))best={id:edge.id,distancePx};
  }
  return best;
};
