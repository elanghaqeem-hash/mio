import type { MioMeshData } from '../../../types/creative';import { validateMeshTopology } from './MeshTopology';import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
export const arrayMesh=(mesh:MioMeshData,count:number,offset:[number,number,number]):MioMeshData=>{
 if(!Number.isInteger(count)||count<1||count>32)throw new Error('Array count must be an integer from 1 to 32.');
 if(!offset.every(Number.isFinite))throw new Error('Array offset must contain finite XYZ values.');
 const validation=validateMeshTopology(mesh);if(!validation.valid)throw new Error(`Cannot array invalid mesh: ${validation.errors.join(' ')}`);
 const vertices:MioMeshData['vertices']=[],faces:MioMeshData['faces']=[];
 for(let i=0;i<count;i++){const suffix=i===0?'':`_array_${i}`;for(const v of mesh.vertices)vertices.push({id:`${v.id}${suffix}`,position:[v.position[0]+offset[0]*i,v.position[1]+offset[1]*i,v.position[2]+offset[2]*i]});for(const f of mesh.faces)faces.push({id:`${f.id}${suffix}`,vertexIds:f.vertexIds.map(id=>`${id}${suffix}`),...(f.materialSlot===undefined?{}:{materialSlot:f.materialSlot})})}
 const result={vertices,faces};const final=validateMeshTopology(result),d=diagnoseMeshTopology(result);if(!final.valid||d.nonManifoldEdgeIds.length||d.inconsistentWindingEdgeIds.length||d.zeroAreaFaceIds.length)throw new Error('Array modifier produced unsafe topology.');return result;
};