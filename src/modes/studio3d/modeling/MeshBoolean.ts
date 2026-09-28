import type { MioBooleanOperation, MioMeshData } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';

export type MeshBooleanOperation=MioBooleanOperation;

interface AxisAlignedBox {
  min:[number,number,number];
  max:[number,number,number];
}

const EPSILON=1e-10;
const normalizedNumber=(value:number):number=>Object.is(value,-0)?0:value;
const coordinateKey=(value:number):string=>String(normalizedNumber(value));
const pointKey=(point:[number,number,number]):string=>point.map(coordinateKey).join('|');
const sortedUnique=(values:number[]):number[]=>[...new Set(values.map(normalizedNumber))].sort((a,b)=>a-b);

const closedSafeMesh=(mesh:MioMeshData):boolean=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)return false;
  const d=diagnoseMeshTopology(mesh);
  return !d.boundaryEdgeIds.length&&!d.nonManifoldEdgeIds.length&&!d.zeroAreaFaceIds.length&&!d.inconsistentWindingEdgeIds.length&&!d.duplicateFaceGroups.length&&!d.isolatedVertexIds.length;
};

const readAxisAlignedBox=(mesh:MioMeshData):AxisAlignedBox|null=>{
  if(mesh.vertices.length!==8||mesh.faces.length!==6||mesh.faces.some(face=>face.vertexIds.length!==4)||!closedSafeMesh(mesh))return null;
  const xs=sortedUnique(mesh.vertices.map(vertex=>vertex.position[0]));
  const ys=sortedUnique(mesh.vertices.map(vertex=>vertex.position[1]));
  const zs=sortedUnique(mesh.vertices.map(vertex=>vertex.position[2]));
  if(xs.length!==2||ys.length!==2||zs.length!==2)return null;
  if(xs[1]-xs[0]<=EPSILON||ys[1]-ys[0]<=EPSILON||zs[1]-zs[0]<=EPSILON)return null;

  const expectedCorners=new Set<string>();
  for(const x of xs)for(const y of ys)for(const z of zs)expectedCorners.add(pointKey([x,y,z]));
  const actualCorners=new Set(mesh.vertices.map(vertex=>pointKey(vertex.position)));
  if(actualCorners.size!==8||[...expectedCorners].some(key=>!actualCorners.has(key)))return null;

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex.position] as const));
  for(const face of mesh.faces){
    const points=face.vertexIds.map(id=>vertexById.get(id)).filter((value):value is [number,number,number]=>Boolean(value));
    if(points.length!==4)return null;
    const constantAxes=[0,1,2].filter(axis=>new Set(points.map(point=>point[axis])).size===1);
    if(constantAxes.length!==1)return null;
    const axis=constantAxes[0];
    const value=points[0][axis];
    const bounds=axis===0?xs:axis===1?ys:zs;
    if(value!==bounds[0]&&value!==bounds[1])return null;
  }
  return{min:[xs[0],ys[0],zs[0]],max:[xs[1],ys[1],zs[1]]};
};

const insideBox=(point:[number,number,number],box:AxisAlignedBox):boolean=>
  point[0]>=box.min[0]-EPSILON&&point[0]<=box.max[0]+EPSILON&&
  point[1]>=box.min[1]-EPSILON&&point[1]<=box.max[1]+EPSILON&&
  point[2]>=box.min[2]-EPSILON&&point[2]<=box.max[2]+EPSILON;

const shouldKeep=(insideA:boolean,insideB:boolean,operation:MeshBooleanOperation):boolean=>{
  switch(operation){
    case'union':return insideA||insideB;
    case'difference':return insideA&&!insideB;
    case'intersection':return insideA&&insideB;
    default:{const exhaustive:never=operation;throw new Error(`Unsupported Boolean operation: ${String(exhaustive)}`);}
  }
};

export const executeMeshBoolean=(sourceA:MioMeshData,sourceB:MioMeshData,operation:MeshBooleanOperation):MioMeshData=>{
  const a=structuredClone(sourceA),b=structuredClone(sourceB);
  const boxA=readAxisAlignedBox(a),boxB=readAxisAlignedBox(b);
  if(!boxA||!boxB)throw new Error('Boolean V5.5 currently supports closed manifold axis-aligned box operands only.');

  const xs=sortedUnique([boxA.min[0],boxA.max[0],boxB.min[0],boxB.max[0]]);
  const ys=sortedUnique([boxA.min[1],boxA.max[1],boxB.min[1],boxB.max[1]]);
  const zs=sortedUnique([boxA.min[2],boxA.max[2],boxB.min[2],boxB.max[2]]);
  const selected=new Set<string>();
  const cellKey=(x:number,y:number,z:number)=>`${x}|${y}|${z}`;

  for(let x=0;x<xs.length-1;x+=1)for(let y=0;y<ys.length-1;y+=1)for(let z=0;z<zs.length-1;z+=1){
    if(xs[x+1]-xs[x]<=EPSILON||ys[y+1]-ys[y]<=EPSILON||zs[z+1]-zs[z]<=EPSILON)continue;
    const center:[number,number,number]=[(xs[x]+xs[x+1])/2,(ys[y]+ys[y+1])/2,(zs[z]+zs[z+1])/2];
    if(shouldKeep(insideBox(center,boxA),insideBox(center,boxB),operation))selected.add(cellKey(x,y,z));
  }

  if(!selected.size)return{vertices:[],faces:[]};

  const vertices:MioMeshData['vertices']=[];
  const faces:MioMeshData['faces']=[];
  const vertexIds=new Map<string,string>();
  const vertexId=(point:[number,number,number]):string=>{
    const key=pointKey(point),existing=vertexIds.get(key);
    if(existing)return existing;
    const id=`bool_v${vertices.length}`;
    vertexIds.set(key,id);
    vertices.push({id,position:[...point]});
    return id;
  };
  const addFace=(id:string,points:[number,number,number][])=>{
    faces.push({id,vertexIds:points.map(vertexId)});
  };
  const directions=[
    {name:'nx',delta:[-1,0,0] as const},
    {name:'px',delta:[1,0,0] as const},
    {name:'ny',delta:[0,-1,0] as const},
    {name:'py',delta:[0,1,0] as const},
    {name:'nz',delta:[0,0,-1] as const},
    {name:'pz',delta:[0,0,1] as const},
  ] as const;

  for(let x=0;x<xs.length-1;x+=1)for(let y=0;y<ys.length-1;y+=1)for(let z=0;z<zs.length-1;z+=1){
    if(!selected.has(cellKey(x,y,z)))continue;
    const x0=xs[x],x1=xs[x+1],y0=ys[y],y1=ys[y+1],z0=zs[z],z1=zs[z+1];
    const corners={
      v000:[x0,y0,z0] as [number,number,number],v100:[x1,y0,z0] as [number,number,number],
      v110:[x1,y1,z0] as [number,number,number],v010:[x0,y1,z0] as [number,number,number],
      v001:[x0,y0,z1] as [number,number,number],v101:[x1,y0,z1] as [number,number,number],
      v111:[x1,y1,z1] as [number,number,number],v011:[x0,y1,z1] as [number,number,number],
    };
    const pointSets={
      nx:[corners.v000,corners.v001,corners.v011,corners.v010],
      px:[corners.v100,corners.v110,corners.v111,corners.v101],
      ny:[corners.v000,corners.v100,corners.v101,corners.v001],
      py:[corners.v010,corners.v011,corners.v111,corners.v110],
      nz:[corners.v000,corners.v010,corners.v110,corners.v100],
      pz:[corners.v001,corners.v101,corners.v111,corners.v011],
    };
    for(const direction of directions){
      const [dx,dy,dz]=direction.delta;
      if(selected.has(cellKey(x+dx,y+dy,z+dz)))continue;
      addFace(`bool_${operation}_${x}_${y}_${z}_${direction.name}`,pointSets[direction.name]);
    }
  }

  const result:MioMeshData={vertices,faces};
  const validation=validateMeshTopology(result);
  if(!validation.valid)throw new Error(`Boolean operation produced invalid topology: ${validation.errors.join(' ')}`);
  const diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.boundaryEdgeIds.length||diagnostics.nonManifoldEdgeIds.length||diagnostics.zeroAreaFaceIds.length||diagnostics.inconsistentWindingEdgeIds.length||diagnostics.duplicateFaceGroups.length||diagnostics.isolatedVertexIds.length){
    throw new Error('Boolean operation produced unsafe topology and was rejected.');
  }
  return result;
};
