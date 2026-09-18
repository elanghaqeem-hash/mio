import type { MioMeshData, MioMeshSelection } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, deriveMeshEdges, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { extrudeMeshFace, normalizeMeshSelection, translateMeshSelection } from '../modes/studio3d/modeling/MeshOperations';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => {
  try { await run(); return { name, passed: true }; }
  catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; }
};

export async function runMeshModelingCoreTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('cube topology exposes deterministic vertices, edges and faces', () => {
    const mesh = createCubeMesh(2);
    const validation = validateMeshTopology(mesh);
    assert(validation.valid, validation.errors.join(' '));
    assert(mesh.vertices.length === 8, 'cube should contain 8 vertices');
    assert(mesh.faces.length === 6, 'cube should contain 6 quad faces');
    assert(deriveMeshEdges(mesh).length === 12, 'cube should contain 12 unique edges');
    assert(deriveMeshEdges(mesh).some((edge) => edge.id === canonicalMeshEdgeId('v0', 'v1')), 'expected canonical cube edge');
  }));

  results.push(await test('invalid face references are rejected before edit operations', () => {
    const mesh: MioMeshData = {
      vertices: [{ id: 'v0', position: [0, 0, 0] }, { id: 'v1', position: [1, 0, 0] }, { id: 'v2', position: [0, 1, 0] }],
      faces: [{ id: 'f0', vertexIds: ['v0', 'v1', 'missing'] }],
    };
    const validation = validateMeshTopology(mesh);
    assert(!validation.valid, 'missing vertex reference should invalidate topology');
    assert(validation.errors.some((error) => error.includes('missing vertex')), 'missing vertex error should be explicit');
  }));

  results.push(await test('selection normalization and translation respect vertex edge and face modes', () => {
    const mesh = createCubeMesh();
    const vertexSelection: MioMeshSelection = { mode: 'vertex', vertexIds: ['v0', 'missing'], edgeIds: [], faceIds: [] };
    const normalized = normalizeMeshSelection(mesh, vertexSelection);
    assert(normalized.vertexIds.length === 1 && normalized.vertexIds[0] === 'v0', 'vertex selection should discard stale IDs');
    const movedVertex = translateMeshSelection(mesh, normalized, [1, 0, 0]);
    assert(movedVertex.vertices.find((vertex) => vertex.id === 'v0')?.position[0] === 0.5, 'selected vertex should move by delta');
    assert(movedVertex.vertices.find((vertex) => vertex.id === 'v1')?.position[0] === 0.5, 'unselected vertex should remain unchanged');

    const edgeSelection: MioMeshSelection = { mode: 'edge', vertexIds: [], edgeIds: [canonicalMeshEdgeId('v0', 'v1')], faceIds: [] };
    const movedEdge = translateMeshSelection(mesh, edgeSelection, [0, 1, 0]);
    assert(movedEdge.vertices.find((vertex) => vertex.id === 'v0')?.position[1] === 0.5, 'first edge vertex should move');
    assert(movedEdge.vertices.find((vertex) => vertex.id === 'v1')?.position[1] === 0.5, 'second edge vertex should move');
    assert(movedEdge.vertices.find((vertex) => vertex.id === 'v4')?.position[1] === -0.5, 'unselected edge vertex should remain unchanged');

    const faceSelection: MioMeshSelection = { mode: 'face', vertexIds: [], edgeIds: [], faceIds: ['f_front'] };
    const movedFace = translateMeshSelection(mesh, faceSelection, [0, 0, 2]);
    for (const id of ['v4', 'v5', 'v6', 'v7']) {
      assert(movedFace.vertices.find((vertex) => vertex.id === id)?.position[2] === 2.5, `${id} should move with selected face`);
    }
  }));

  results.push(await test('single face extrusion creates cap and side topology without corrupting manifold cube', () => {
    const mesh = createCubeMesh();
    const result = extrudeMeshFace(mesh, 'f_front', 1);
    const validation = validateMeshTopology(result.mesh);
    assert(validation.valid, validation.errors.join(' '));
    assert(result.mesh.vertices.length === 12, 'quad extrusion should create 4 vertices');
    assert(result.mesh.faces.length === 10, 'quad extrusion should replace one face with cap plus four sides');
    assert(!result.mesh.faces.some((face) => face.id === 'f_front'), 'source face should be replaced');
    assert(result.mesh.faces.some((face) => face.id === result.capFaceId), 'extrusion cap should exist');
    assert(result.createdFaceIds.length === 5, 'quad extrusion should create 1 cap and 4 side faces');
    const cap = result.mesh.faces.find((face) => face.id === result.capFaceId);
    assert(Boolean(cap), 'cap face should be present');
    for (const id of cap?.vertexIds ?? []) {
      assert(result.mesh.vertices.find((vertex) => vertex.id === id)?.position[2] === 1.5, 'front extrusion should move cap along face normal');
    }
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
