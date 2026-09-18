import type { MioMeshData, MioMeshEdge } from '../../../types/creative';

export interface MeshTopologyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const finiteVector = (value: [number, number, number]): boolean =>
  value.every((component) => Number.isFinite(component));

export const canonicalMeshEdgeId = (a: string, b: string): string =>
  a < b ? `edge:${a}|${b}` : `edge:${b}|${a}`;

export const deriveMeshEdges = (mesh: MioMeshData): MioMeshEdge[] => {
  const edges = new Map<string, MioMeshEdge>();
  for (const face of mesh.faces) {
    for (let index = 0; index < face.vertexIds.length; index += 1) {
      const a = face.vertexIds[index];
      const b = face.vertexIds[(index + 1) % face.vertexIds.length];
      const id = canonicalMeshEdgeId(a, b);
      const existing = edges.get(id);
      if (existing) {
        if (!existing.faceIds.includes(face.id)) existing.faceIds.push(face.id);
      } else {
        edges.set(id, { id, vertexIds: a < b ? [a, b] : [b, a], faceIds: [face.id] });
      }
    }
  }
  return [...edges.values()].sort((left, right) => left.id.localeCompare(right.id));
};

export const validateMeshTopology = (mesh: MioMeshData): MeshTopologyValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const vertexIds = new Set<string>();
  const faceIds = new Set<string>();

  for (const vertex of mesh.vertices) {
    if (!vertex.id.trim()) errors.push('Mesh vertex ID is required.');
    if (vertexIds.has(vertex.id)) errors.push(`Duplicate mesh vertex ID: ${vertex.id}.`);
    vertexIds.add(vertex.id);
    if (!finiteVector(vertex.position)) errors.push(`Vertex ${vertex.id} contains a non-finite position.`);
  }

  for (const face of mesh.faces) {
    if (!face.id.trim()) errors.push('Mesh face ID is required.');
    if (faceIds.has(face.id)) errors.push(`Duplicate mesh face ID: ${face.id}.`);
    faceIds.add(face.id);
    if (face.vertexIds.length < 3) errors.push(`Face ${face.id} must contain at least three vertices.`);
    if (new Set(face.vertexIds).size !== face.vertexIds.length) errors.push(`Face ${face.id} contains repeated vertices.`);
    for (const vertexId of face.vertexIds) {
      if (!vertexIds.has(vertexId)) errors.push(`Face ${face.id} references missing vertex ${vertexId}.`);
    }
  }

  if (errors.length === 0) {
    for (const edge of deriveMeshEdges(mesh)) {
      if (edge.faceIds.length > 2) warnings.push(`Non-manifold edge ${edge.id} belongs to ${edge.faceIds.length} faces.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
};

export const createCubeMesh = (size = 1): MioMeshData => {
  if (!Number.isFinite(size) || size <= 0) throw new Error('Cube size must be a positive finite number.');
  const h = size / 2;
  return {
    vertices: [
      { id: 'v0', position: [-h, -h, -h] },
      { id: 'v1', position: [h, -h, -h] },
      { id: 'v2', position: [h, h, -h] },
      { id: 'v3', position: [-h, h, -h] },
      { id: 'v4', position: [-h, -h, h] },
      { id: 'v5', position: [h, -h, h] },
      { id: 'v6', position: [h, h, h] },
      { id: 'v7', position: [-h, h, h] },
    ],
    faces: [
      { id: 'f_back', vertexIds: ['v0', 'v3', 'v2', 'v1'] },
      { id: 'f_front', vertexIds: ['v4', 'v5', 'v6', 'v7'] },
      { id: 'f_bottom', vertexIds: ['v0', 'v1', 'v5', 'v4'] },
      { id: 'f_top', vertexIds: ['v3', 'v7', 'v6', 'v2'] },
      { id: 'f_left', vertexIds: ['v0', 'v4', 'v7', 'v3'] },
      { id: 'f_right', vertexIds: ['v1', 'v2', 'v6', 'v5'] },
    ],
  };
};
