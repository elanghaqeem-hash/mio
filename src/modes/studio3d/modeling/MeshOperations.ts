import type { MioMeshData, MioMeshSelection, MioMeshVertex } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

const clone = <T>(value: T): T => structuredClone(value);

const ensureValidMesh = (mesh: MioMeshData): void => {
  const validation = validateMeshTopology(mesh);
  if (!validation.valid) throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const uniqueId = (base: string, used: Set<string>): string => {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
};

export const normalizeMeshSelection = (mesh: MioMeshData, selection: MioMeshSelection): MioMeshSelection => {
  ensureValidMesh(mesh);
  const vertices = new Set(mesh.vertices.map((vertex) => vertex.id));
  const faces = new Set(mesh.faces.map((face) => face.id));
  const edges = new Set(deriveMeshEdges(mesh).map((edge) => edge.id));
  return {
    mode: selection.mode,
    vertexIds: selection.mode === 'vertex' ? [...new Set(selection.vertexIds.filter((id) => vertices.has(id)))] : [],
    edgeIds: selection.mode === 'edge' ? [...new Set(selection.edgeIds.filter((id) => edges.has(id)))] : [],
    faceIds: selection.mode === 'face' ? [...new Set(selection.faceIds.filter((id) => faces.has(id)))] : [],
  };
};

export const meshSelectionVertexIds = (mesh: MioMeshData, selection: MioMeshSelection): string[] => {
  const normalized = normalizeMeshSelection(mesh, selection);
  if (normalized.mode === 'vertex') return normalized.vertexIds;
  if (normalized.mode === 'edge') {
    const selected = new Set(normalized.edgeIds);
    return [...new Set(deriveMeshEdges(mesh).filter((edge) => selected.has(edge.id)).flatMap((edge) => edge.vertexIds))];
  }
  const selectedFaces = new Set(normalized.faceIds);
  return [...new Set(mesh.faces.filter((face) => selectedFaces.has(face.id)).flatMap((face) => face.vertexIds))];
};

export const translateMeshSelection = (
  mesh: MioMeshData,
  selection: MioMeshSelection,
  delta: [number, number, number],
): MioMeshData => {
  ensureValidMesh(mesh);
  if (!delta.every((value) => Number.isFinite(value))) throw new Error('Mesh translation delta must be finite.');
  const selectedVertexIds = new Set(meshSelectionVertexIds(mesh, selection));
  return {
    ...clone(mesh),
    vertices: mesh.vertices.map((vertex) => selectedVertexIds.has(vertex.id)
      ? { ...vertex, position: [
        vertex.position[0] + delta[0],
        vertex.position[1] + delta[1],
        vertex.position[2] + delta[2],
      ] as [number, number, number] }
      : clone(vertex)),
  };
};

const faceNormal = (vertices: MioMeshVertex[]): [number, number, number] => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index].position;
    const next = vertices[(index + 1) % vertices.length].position;
    x += (current[1] - next[1]) * (current[2] + next[2]);
    y += (current[2] - next[2]) * (current[0] + next[0]);
    z += (current[0] - next[0]) * (current[1] + next[1]);
  }
  const length = Math.hypot(x, y, z);
  if (length <= Number.EPSILON) throw new Error('Cannot extrude a degenerate face.');
  return [x / length, y / length, z / length];
};

export interface MeshExtrudeResult {
  mesh: MioMeshData;
  capFaceId: string;
  createdVertexIds: string[];
  createdFaceIds: string[];
}

export const extrudeMeshFace = (mesh: MioMeshData, faceId: string, distance: number): MeshExtrudeResult => {
  ensureValidMesh(mesh);
  if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) throw new Error('Extrude distance must be a non-zero finite number.');
  const face = mesh.faces.find((candidate) => candidate.id === faceId);
  if (!face) throw new Error(`Mesh face ${faceId} does not exist.`);

  const vertexById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex]));
  const sourceVertices = face.vertexIds.map((vertexId) => {
    const vertex = vertexById.get(vertexId);
    if (!vertex) throw new Error(`Mesh face ${faceId} references missing vertex ${vertexId}.`);
    return vertex;
  });
  const normal = faceNormal(sourceVertices);
  const usedVertexIds = new Set(mesh.vertices.map((vertex) => vertex.id));
  const usedFaceIds = new Set(mesh.faces.map((candidate) => candidate.id));
  const createdVertices: MioMeshVertex[] = [];
  const extrudedIds: string[] = [];

  for (const source of sourceVertices) {
    const id = uniqueId(`${source.id}_extrude`, usedVertexIds);
    usedVertexIds.add(id);
    extrudedIds.push(id);
    createdVertices.push({
      id,
      position: [
        source.position[0] + normal[0] * distance,
        source.position[1] + normal[1] * distance,
        source.position[2] + normal[2] * distance,
      ],
    });
  }

  const capFaceId = uniqueId(`${face.id}_cap`, usedFaceIds);
  usedFaceIds.add(capFaceId);
  const createdFaces = [{ id: capFaceId, vertexIds: extrudedIds }];

  for (let index = 0; index < face.vertexIds.length; index += 1) {
    const next = (index + 1) % face.vertexIds.length;
    const sideId = uniqueId(`${face.id}_side_${index + 1}`, usedFaceIds);
    usedFaceIds.add(sideId);
    createdFaces.push({
      id: sideId,
      vertexIds: [face.vertexIds[index], face.vertexIds[next], extrudedIds[next], extrudedIds[index]],
    });
  }

  const result: MioMeshData = {
    vertices: [...mesh.vertices.map(clone), ...createdVertices],
    faces: [...mesh.faces.filter((candidate) => candidate.id !== face.id).map(clone), ...createdFaces],
  };
  ensureValidMesh(result);
  return {
    mesh: result,
    capFaceId,
    createdVertexIds: extrudedIds,
    createdFaceIds: createdFaces.map((createdFace) => createdFace.id),
  };
};
