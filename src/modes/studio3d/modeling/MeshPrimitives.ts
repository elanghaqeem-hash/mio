import type { Mio3DObject, MioMeshData } from '../../../types/creative';
import { createCubeMesh, validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';

const finalize=(mesh:MioMeshData):MioMeshData=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Primitive mesh invalid: ${validation.errors.join(' ')}`);
  const diagnostics=diagnoseMeshTopology(mesh);
  if(diagnostics.nonManifoldEdgeIds.length||diagnostics.zeroAreaFaceIds.length||diagnostics.inconsistentWindingEdgeIds.length||diagnostics.duplicateFaceGroups.length||diagnostics.isolatedVertexIds.length)throw new Error('Primitive mesh failed topology safety checks.');
  return mesh;
};

export const createCylinderMesh=(radius=0.5,height=1.2,segments=24):MioMeshData=>{
  if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(height)||height<=0||!Number.isInteger(segments)||segments<3||segments>128)throw new Error('Cylinder parameters are out of bounds.');
  const h=height/2,vertices:MioMeshData['vertices']=[],faces:MioMeshData['faces']=[];
  for(let index=0;index<segments;index+=1){
    const angle=index/segments*Math.PI*2,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    vertices.push({id:`cyl_b_${index}`,position:[x,-h,z]},{id:`cyl_t_${index}`,position:[x,h,z]});
  }
  for(let index=0;index<segments;index+=1){
    const next=(index+1)%segments;
    faces.push({id:`cyl_side_${index}`,vertexIds:[`cyl_b_${index}`,`cyl_t_${index}`,`cyl_t_${next}`,`cyl_b_${next}`]});
  }
  faces.push({id:'cyl_bottom',vertexIds:Array.from({length:segments},(_,index)=>`cyl_b_${index}`)});
  faces.push({id:'cyl_top',vertexIds:Array.from({length:segments},(_,index)=>`cyl_t_${segments-1-index}`)});
  return finalize({vertices,faces});
};

export const createUvSphereMesh=(radius=0.7,segments=24,rings=12):MioMeshData=>{
  if(!Number.isFinite(radius)||radius<=0||!Number.isInteger(segments)||segments<3||segments>128||!Number.isInteger(rings)||rings<3||rings>64)throw new Error('Sphere parameters are out of bounds.');
  const vertices:MioMeshData['vertices']=[{id:'sphere_top',position:[0,radius,0]},{id:'sphere_bottom',position:[0,-radius,0]}],faces:MioMeshData['faces']=[];
  for(let ring=1;ring<rings;ring+=1){
    const phi=Math.PI*ring/rings,y=Math.cos(phi)*radius,radial=Math.sin(phi)*radius;
    for(let segment=0;segment<segments;segment+=1){
      const theta=segment/segments*Math.PI*2;
      vertices.push({id:`sphere_r${ring}_s${segment}`,position:[Math.cos(theta)*radial,y,Math.sin(theta)*radial]});
    }
  }
  for(let segment=0;segment<segments;segment+=1){
    const next=(segment+1)%segments;
    faces.push({id:`sphere_top_${segment}`,vertexIds:['sphere_top',`sphere_r1_s${next}`,`sphere_r1_s${segment}`]});
    faces.push({id:`sphere_bottom_${segment}`,vertexIds:['sphere_bottom',`sphere_r${rings-1}_s${segment}`,`sphere_r${rings-1}_s${next}`]});
  }
  for(let ring=1;ring<rings-1;ring+=1){
    for(let segment=0;segment<segments;segment+=1){
      const next=(segment+1)%segments;
      faces.push({id:`sphere_side_r${ring}_s${segment}`,vertexIds:[`sphere_r${ring}_s${segment}`,`sphere_r${ring}_s${next}`,`sphere_r${ring+1}_s${next}`,`sphere_r${ring+1}_s${segment}`]});
    }
  }
  return finalize({vertices,faces});
};

export const createTorusMesh=(majorRadius=0.7,minorRadius=0.2,majorSegments=32,minorSegments=16):MioMeshData=>{
  if(!Number.isFinite(majorRadius)||majorRadius<=0||!Number.isFinite(minorRadius)||minorRadius<=0||minorRadius>=majorRadius||!Number.isInteger(majorSegments)||majorSegments<3||majorSegments>128||!Number.isInteger(minorSegments)||minorSegments<3||minorSegments>64)throw new Error('Torus parameters are out of bounds.');
  const vertices:MioMeshData['vertices']=[],faces:MioMeshData['faces']=[];
  for(let major=0;major<majorSegments;major+=1){
    const u=major/majorSegments*Math.PI*2,cu=Math.cos(u),su=Math.sin(u);
    for(let minor=0;minor<minorSegments;minor+=1){
      const v=minor/minorSegments*Math.PI*2,cv=Math.cos(v),sv=Math.sin(v),radial=majorRadius+minorRadius*cv;
      vertices.push({id:`torus_u${major}_v${minor}`,position:[radial*cu,minorRadius*sv,radial*su]});
    }
  }
  for(let major=0;major<majorSegments;major+=1)for(let minor=0;minor<minorSegments;minor+=1){
    const nextMajor=(major+1)%majorSegments,nextMinor=(minor+1)%minorSegments;
    faces.push({id:`torus_f_${major}_${minor}`,vertexIds:[`torus_u${major}_v${minor}`,`torus_u${major}_v${nextMinor}`,`torus_u${nextMajor}_v${nextMinor}`,`torus_u${nextMajor}_v${minor}`]});
  }
  return finalize({vertices,faces});
};

export const createPlaneMesh=(size=1):MioMeshData=>{
  if(!Number.isFinite(size)||size<=0)throw new Error('Plane size must be positive.');
  const h=size/2;
  return finalize({vertices:[
    {id:'plane_v0',position:[-h,0,-h]},{id:'plane_v1',position:[h,0,-h]},{id:'plane_v2',position:[h,0,h]},{id:'plane_v3',position:[-h,0,h]},
  ],faces:[{id:'plane_f0',vertexIds:['plane_v0','plane_v3','plane_v2','plane_v1']}]});
};

export const createPrimitiveMesh=(type:Mio3DObject['type']):MioMeshData|null=>{
  switch(type){
    case'cube':case'mech_core':case'drone_hull':return createCubeMesh();
    case'cylinder':return createCylinderMesh();
    case'sphere':return createUvSphereMesh();
    case'torus':return createTorusMesh();
    case'plane':return createPlaneMesh();
    case'custom':return null;
    default:{const exhaustive:never=type;throw new Error(`Unsupported primitive type: ${String(exhaustive)}`);}
  }
};
