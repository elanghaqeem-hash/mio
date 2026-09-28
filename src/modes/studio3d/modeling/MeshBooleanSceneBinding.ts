import type { Mio3DObject, Mio3DScene, MioMeshData } from '../../../types/creative';
import { evaluateMeshModifierStack, type MioModifierEvaluationResult } from './MeshModifierStack';

const EPSILON=1e-10;

const requireBindableTransform=(object:Mio3DObject):void=>{
  if(object.position.some(value=>!Number.isFinite(value)))throw new Error(`Boolean operand binding requires finite position values for object ${object.id}.`);
  if(object.rotation.some(value=>!Number.isFinite(value)||Math.abs(value)>EPSILON))throw new Error(`Boolean V5.6 scene binding supports rotation-free operands only: ${object.id}.`);
  if(object.scale.some(value=>!Number.isFinite(value)||value<=EPSILON))throw new Error(`Boolean V5.6 scene binding requires positive finite scale values for object ${object.id}.`);
};

export const mapMeshBetweenSceneObjects=(mesh:MioMeshData,fromObject:Mio3DObject,toObject:Mio3DObject):MioMeshData=>{
  requireBindableTransform(fromObject);
  requireBindableTransform(toObject);
  return{
    vertices:mesh.vertices.map(vertex=>{
      const world:[number,number,number]=[
        fromObject.position[0]+vertex.position[0]*fromObject.scale[0],
        fromObject.position[1]+vertex.position[1]*fromObject.scale[1],
        fromObject.position[2]+vertex.position[2]*fromObject.scale[2],
      ];
      return{id:vertex.id,position:[
        (world[0]-toObject.position[0])/toObject.scale[0],
        (world[1]-toObject.position[1])/toObject.scale[1],
        (world[2]-toObject.position[2])/toObject.scale[2],
      ]};
    }),
    faces:mesh.faces.map(face=>structuredClone(face)),
  };
};

export const evaluateSceneObjectMesh=(scene:Mio3DScene,objectId:string):MioModifierEvaluationResult=>{
  const objectById=new Map(scene.objects.map(object=>[object.id,object] as const));
  const evaluate=(currentId:string,path:string[]):MioModifierEvaluationResult=>{
    if(path.includes(currentId))throw new Error(`Boolean modifier cycle detected: ${[...path,currentId].join(' -> ')}.`);
    const object=objectById.get(currentId);
    if(!object)throw new Error(`3D object not found: ${currentId}.`);
    if(!object.mesh)throw new Error(`3D object ${currentId} has no authoritative MioMeshData for modifier evaluation.`);
    const nextPath=[...path,currentId];
    return evaluateMeshModifierStack(object.mesh,object.modifiers,{
      resolveBooleanOperand:(modifier)=>{
        if(modifier.operandObjectId===currentId)throw new Error(`Boolean modifier on ${currentId} cannot reference itself.`);
        const operand=objectById.get(modifier.operandObjectId);
        if(!operand)throw new Error(`Boolean operand object not found: ${modifier.operandObjectId}.`);
        if(!operand.mesh)throw new Error(`Boolean operand ${operand.id} has no authoritative MioMeshData.`);
        const evaluatedOperand=evaluate(operand.id,nextPath).mesh;
        return mapMeshBetweenSceneObjects(evaluatedOperand,operand,object);
      },
    });
  };
  return evaluate(objectId,[]);
};
