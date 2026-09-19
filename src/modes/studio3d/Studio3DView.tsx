import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Vector2,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Mio3DObject, Mio3DScene, MioMeshSelection, MioMeshSelectionMode } from '../../types/creative';
import { createCubeMesh } from './modeling/MeshTopology';
import { extrudeMeshFace, translateMeshSelection } from './modeling/MeshOperations';
import { extrudeMeshRegion } from './modeling/MeshRegionExtrude';
import { insetMeshFace } from './modeling/MeshFaceInset';
import { insetMeshRegion } from './modeling/MeshRegionInset';
import { weldMeshVertices, weldMeshVerticesByDistance } from './modeling/MeshVertexWeld';
import { meshSelectionPivot } from './modeling/MeshTransformTransaction';
import { applyComponentGizmoPreview, identityComponentGizmoPose } from './modeling/MeshComponentTransformPreview';
import { faceIdFromTriangleIndex, projectMeshToBufferGeometry, type MeshGeometryProjection } from './modeling/MeshGeometryProjection';
import { clearMeshSelection, toggleFaceSelection } from './modeling/MeshSelection';
import { buildEdgeOverlayPositions, buildSelectedFaceOverlayGeometry, buildVertexOverlayPositions } from './modeling/MeshSelectionOverlay';
import { pickMeshEdgeScreenSpace, pickMeshVertexScreenSpace } from './modeling/MeshComponentPicking';
import { BufferGeometry as ThreeBufferGeometry, Float32BufferAttribute } from 'three';
import { ExportManager } from '../../project/ExportManager';
import { Box, Circle, Copy, Cylinder, Layers, Download, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';

const INITIAL_SCENE: Mio3DScene = {
  objects: [
    { id: 'obj_core_1', name: 'Vanguard_Mech_Hull', type: 'mech_core', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#00f0ff', metalness: 0.85, roughness: 0.2, wireframe: false },
    { id: 'obj_wing_l', name: 'Thruster_Pod_L', type: 'cylinder', position: [-1.4, 0.2, -0.4], rotation: [0, 0, Math.PI / 4], scale: [0.35, 1.2, 0.35], color: '#38bdf8', metalness: 0.7, roughness: 0.3, wireframe: false },
    { id: 'obj_wing_r', name: 'Thruster_Pod_R', type: 'cylinder', position: [1.4, 0.2, -0.4], rotation: [0, 0, -Math.PI / 4], scale: [0.35, 1.2, 0.35], color: '#38bdf8', metalness: 0.7, roughness: 0.3, wireframe: false },
  ],
  camera: { position: [0, 2.5, 4.5], fov: 50 },
  lights: { ambientColor: '#070b14', ambientIntensity: 0.8, directionalColor: '#00f0ff', directionalIntensity: 1.6 },
};

const activityTimestamp = () => Date.now();

export const Studio3DView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformHelperRef = useRef<ReturnType<TransformControls['getHelper']> | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const meshProjectionMapRef = useRef<Map<string, MeshGeometryProjection>>(new Map());
  const editOverlayRef = useRef<Array<Points | LineSegments | Mesh>>([]);
  const workspace = useCreativeStudioDocument<Mio3DScene>('MIO_Local_Scene.mio3d', INITIAL_SCENE);
  const { state: sceneData, setState: setSceneData } = workspace;
  const [selectedId, setSelectedId] = useState('obj_core_1');
  const [transformMode, setTransformMode] = useState<'select' | 'move' | 'rotate' | 'scale'>('select');
  const [workspaceMode, setWorkspaceMode] = useState<'object' | 'edit'>('object');
  const [transformSnapEnabled, setTransformSnapEnabled] = useState(false);
  const [transformSnapStep, setTransformSnapStep] = useState(0.1);
  const [extrudeDistance, setExtrudeDistance] = useState(0.25);
  const [insetRatio, setInsetRatio] = useState(0.25);
  const [weldDistance, setWeldDistance] = useState(0.05);
  const [meshSelection, setMeshSelection] = useState<MioMeshSelection>({ mode: 'face', vertexIds: [], edgeIds: [], faceIds: [] });
  const selectedObj = sceneData.objects.find((object) => object.id === selectedId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const meshMap = meshMapRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scene = new Scene();
    scene.background = new Color('#07090e');
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(INITIAL_SCENE.camera.fov, width / height, 0.1, 1000);
    camera.position.set(...INITIAL_SCENE.camera.position);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const grid = new GridHelper(10, 20, 0x00f0ff, 0x1e293b);
    grid.position.y = -1;
    scene.add(grid);
    scene.add(new AmbientLight(new Color(INITIAL_SCENE.lights.ambientColor), INITIAL_SCENE.lights.ambientIntensity));
    const primaryLight = new DirectionalLight(new Color(INITIAL_SCENE.lights.directionalColor), INITIAL_SCENE.lights.directionalIntensity);
    primaryLight.position.set(5, 10, 7);
    scene.add(primaryLight);
    const secondaryLight = new DirectionalLight(0x38bdf8, 0.8);
    secondaryLight.position.set(-5, -5, -5);
    scene.add(secondaryLight);

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      const currentContainer = containerRef.current;
      const currentRenderer = rendererRef.current;
      const currentCamera = cameraRef.current;
      if (!currentContainer || !currentRenderer || !currentCamera) return;
      const nextWidth = currentContainer.clientWidth;
      const nextHeight = currentContainer.clientHeight;
      currentCamera.aspect = nextWidth / nextHeight;
      currentCamera.updateProjectionMatrix();
      currentRenderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      meshMap.forEach((mesh) => {
        mesh.geometry.dispose();
        if (mesh.material instanceof MeshStandardMaterial) mesh.material.dispose();
      });
      meshMap.clear();
      controls.dispose();
      transformControlsRef.current?.detach();
      transformControlsRef.current?.dispose();
      transformControlsRef.current = null;
      transformHelperRef.current = null;
      renderer.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    meshMapRef.current.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof MeshStandardMaterial) mesh.material.dispose();
    });
    meshMapRef.current.clear();
    meshProjectionMapRef.current.clear();

    for (const object of sceneData.objects) {
      let geometry: BufferGeometry;
      if (object.mesh) {
        const projection = projectMeshToBufferGeometry(object.mesh);
        geometry = projection.geometry;
        meshProjectionMapRef.current.set(object.id, projection);
      }
      else if (object.type === 'sphere') geometry = new SphereGeometry(0.7, 32, 32);
      else if (object.type === 'cylinder') geometry = new CylinderGeometry(0.5, 0.5, 1.2, 24);
      else if (object.type === 'torus') geometry = new TorusGeometry(0.7, 0.2, 16, 32);
      else geometry = new BoxGeometry(1, 1, 1);
      const material = new MeshStandardMaterial({ color: new Color(object.color), metalness: object.metalness, roughness: object.roughness, wireframe: object.wireframe });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(...object.position);
      mesh.rotation.set(...object.rotation);
      mesh.scale.set(...object.scale);
      mesh.visible = object.visible !== false;
      scene.add(mesh);
      meshMapRef.current.set(object.id, mesh);
    }
  }, [sceneData.objects]);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const orbit = controlsRef.current;
    if (!scene || !camera || !renderer || !orbit) return;
    const previous = transformControlsRef.current;
    if (previous) {
      const previousHelper = transformHelperRef.current;
      if (previousHelper) scene.remove(previousHelper);
      previous.detach();
      previous.dispose();
      transformHelperRef.current = null;
      transformControlsRef.current = null;
    }
    if (workspaceMode !== 'object' || transformMode === 'select' || !selectedObj) return;
    const target = meshMapRef.current.get(selectedObj.id);
    if (!target) return;
    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setMode(transformMode === 'move' ? 'translate' : transformMode);
    gizmo.setSpace('world');
    gizmo.setSize(0.85);
    gizmo.attach(target);
    const helper = gizmo.getHelper();
    scene.add(helper);
    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = Boolean(event.value);
      orbit.enabled = !dragging;
      if (!dragging) {
        updateSelectedObject({
          position: [target.position.x, target.position.y, target.position.z],
          rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
          scale: [target.scale.x, target.scale.y, target.scale.z],
        });
      }
    };
    gizmo.addEventListener('dragging-changed', onDraggingChanged);
    transformHelperRef.current = helper;
    transformControlsRef.current = gizmo;
    return () => {
      orbit.enabled = true;
      gizmo.removeEventListener('dragging-changed', onDraggingChanged);
      gizmo.detach();
      scene.remove(helper);
      gizmo.dispose();
      if (transformControlsRef.current === gizmo) transformControlsRef.current = null;
    };
  }, [workspaceMode, transformMode, selectedId, selectedObj?.id]);
 
  useEffect(() => {
    if (workspaceMode !== 'edit' || transformMode === 'select' || !selectedObj?.mesh) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const orbit = controlsRef.current;
    const sourceMesh = meshMapRef.current.get(selectedObj.id);
    const pivot = meshSelectionPivot(selectedObj.mesh, meshSelection);
    if (!scene || !camera || !renderer || !orbit || !sourceMesh || !pivot) return;

    const proxy = new Object3D();
    proxy.name = 'MIO_Component_Transform_Proxy';
    proxy.position.set(...pivot);
    sourceMesh.add(proxy);

    const originalMesh = structuredClone(selectedObj.mesh);
    let previewMesh = structuredClone(originalMesh);
    let dragging = false;

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setMode(transformMode === 'move' ? 'translate' : transformMode);
    gizmo.setSpace('local');
    gizmo.setSize(0.72);
    gizmo.setTranslationSnap(transformSnapEnabled ? transformSnapStep : null);
    gizmo.setScaleSnap(transformSnapEnabled ? transformSnapStep : null);
    gizmo.setRotationSnap(transformSnapEnabled ? Math.PI / 12 : null);
    gizmo.attach(proxy);
    const helper = gizmo.getHelper();
    scene.add(helper);
    transformControlsRef.current = gizmo;
    transformHelperRef.current = helper;

    const projectPreview = () => {
      const pose = identityComponentGizmoPose(pivot);
      pose.position = [proxy.position.x, proxy.position.y, proxy.position.z];
      pose.rotation = [proxy.rotation.x, proxy.rotation.y, proxy.rotation.z];
      pose.scale = [proxy.scale.x, proxy.scale.y, proxy.scale.z];
      previewMesh = applyComponentGizmoPreview(originalMesh, meshSelection, transformMode, pivot, pose);
      const projection = projectMeshToBufferGeometry(previewMesh);
      sourceMesh.geometry.dispose();
      sourceMesh.geometry = projection.geometry;
      meshProjectionMapRef.current.set(selectedObj.id, projection);
    };

    const onObjectChange = () => {
      if (dragging) projectPreview();
    };
    const onDraggingChanged = (event: { value: unknown }) => {
      dragging = Boolean(event.value);
      orbit.enabled = !dragging;
      if (!dragging && JSON.stringify(previewMesh) !== JSON.stringify(originalMesh)) {
        updateSelectedObject({ mesh: previewMesh });
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragging) return;
      previewMesh = structuredClone(originalMesh);
      const projection = projectMeshToBufferGeometry(previewMesh);
      sourceMesh.geometry.dispose();
      sourceMesh.geometry = projection.geometry;
      meshProjectionMapRef.current.set(selectedObj.id, projection);
      proxy.position.set(...pivot);
      proxy.rotation.set(0, 0, 0);
      proxy.scale.set(1, 1, 1);
      (gizmo as unknown as { reset?: () => void }).reset?.();
      dragging = false;
      orbit.enabled = true;
    };

    gizmo.addEventListener('objectChange', onObjectChange);
    gizmo.addEventListener('dragging-changed', onDraggingChanged);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      orbit.enabled = true;
      window.removeEventListener('keydown', onKeyDown);
      gizmo.removeEventListener('objectChange', onObjectChange);
      gizmo.removeEventListener('dragging-changed', onDraggingChanged);
      gizmo.detach();
      scene.remove(helper);
      sourceMesh.remove(proxy);
      gizmo.dispose();
      if (transformControlsRef.current === gizmo) transformControlsRef.current = null;
      if (transformHelperRef.current === helper) transformHelperRef.current = null;
    };
  }, [workspaceMode, transformMode, selectedId, selectedObj?.mesh, meshSelection, transformSnapEnabled, transformSnapStep]);

  useEffect(() => {
    const scene = sceneRef.current;
    editOverlayRef.current.forEach((overlay) => {
      scene?.remove(overlay);
      const drawable = overlay as Points | LineSegments | Mesh;
      drawable.geometry?.dispose();
      const material = drawable.material;
      if (material && !Array.isArray(material)) material.dispose();
    });
    editOverlayRef.current = [];
    if (!scene || workspaceMode !== 'edit' || !selectedObj?.mesh) return;
    const sourceMesh = meshMapRef.current.get(selectedObj.id);
    if (!sourceMesh) return;
    const attachTransform = (object: Points | LineSegments | Mesh) => {
      object.position.copy(sourceMesh.position);
      object.rotation.copy(sourceMesh.rotation);
      object.scale.copy(sourceMesh.scale);
      object.renderOrder = 10;
      scene.add(object);
      editOverlayRef.current.push(object);
    };
    if (meshSelection.mode === 'vertex') {
      const geometry = new ThreeBufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(buildVertexOverlayPositions(selectedObj.mesh), 3));
      attachTransform(new Points(geometry, new PointsMaterial({ color: 0xffc107, size: 0.08, sizeAttenuation: true, depthTest: false })));
    }
    if (meshSelection.mode === 'edge') {
      const geometry = new ThreeBufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(buildEdgeOverlayPositions(selectedObj.mesh), 3));
      attachTransform(new LineSegments(geometry, new LineBasicMaterial({ color: 0xffc107, depthTest: false })));
    }
    if (meshSelection.mode === 'face' && meshSelection.faceIds.length) {
      const geometry = buildSelectedFaceOverlayGeometry(selectedObj.mesh, meshSelection);
      attachTransform(new Mesh(geometry, new MeshStandardMaterial({ color: 0xffc107, transparent: true, opacity: 0.38, depthTest: false })));
    }
  }, [workspaceMode, meshSelection, selectedObj]);

  const updateSelectedObject = (updates: Partial<Mio3DObject>) => {
    if (!selectedId) return;
    setSceneData((previous) => ({ ...previous, objects: previous.objects.map((object) => object.id === selectedId ? { ...object, ...updates } : object) }));
  };

  const addObject = (type: Mio3DObject['type']) => {
    const sequence = sceneData.objects.length + 1;
    const object: Mio3DObject = { id: `obj_${type}_${sequence}`, name: `New_${type}_${sequence}`, type, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#00f0ff', metalness: 0.8, roughness: 0.2, wireframe: false, mesh: type === 'cube' ? createCubeMesh() : undefined };
    setSceneData((previous) => ({ ...previous, objects: [...previous.objects, object] }));
    setSelectedId(object.id);
    eventBus.emit('ACTIVITY_LOG', { timestamp: activityTimestamp(), message: `Created local 3D ${type} primitive: ${object.name}`, mode: '3D' });
  };

  const deleteObject = useCallback((id: string) => {
    setSceneData((previous) => {
      const objects = previous.objects.filter((object) => object.id !== id);
      if (selectedId === id) setSelectedId(objects[0]?.id ?? '');
      return { ...previous, objects };
    });
  }, [selectedId, setSceneData]);

  const duplicateObject = useCallback((id: string) => {
    const source = sceneData.objects.find((object) => object.id === id);
    if (!source) return;
    const suffix = `${Date.now().toString(36)}`;
    const duplicate: Mio3DObject = {
      ...structuredClone(source),
      id: `${source.id}_copy_${suffix}`,
      name: `${source.name}_Copy`,
      position: [source.position[0] + 0.35, source.position[1], source.position[2] + 0.35],
    };
    setSceneData((previous) => ({ ...previous, objects: [...previous.objects, duplicate] }));
    setSelectedId(duplicate.id);
  }, [sceneData.objects, setSceneData]);

  const setCameraView = (view: 'perspective' | 'front' | 'top') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (view === 'front') camera.position.set(0, 0, 6);
    else if (view === 'top') camera.position.set(0, 6, 0.01);
    else camera.position.set(4.5, 3.2, 4.5);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === 'w') setTransformMode('move');
      if (event.key.toLowerCase() === 'e') setTransformMode('rotate');
      if (event.key.toLowerCase() === 'r') setTransformMode('scale');
      if (event.key.toLowerCase() === 'q') setTransformMode('select');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateObject(selectedId); }
      if (event.key === 'Delete' && sceneData.objects.length > 1) deleteObject(selectedId);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [deleteObject, duplicateObject, sceneData.objects.length, selectedId]);

  const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (workspaceMode !== 'edit' || !selectedObj?.mesh) return;
    const activeGizmoAxis = (transformControlsRef.current as unknown as { axis?: string | null } | null)?.axis;
    if (activeGizmoAxis) return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const mesh = meshMapRef.current.get(selectedObj.id);
    const projection = meshProjectionMapRef.current.get(selectedObj.id);
    if (!renderer || !camera || !mesh) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const screenPointer = new Vector2(event.clientX - rect.left, event.clientY - rect.top);
    if (meshSelection.mode === 'vertex') {
      const picked = pickMeshVertexScreenSpace(selectedObj.mesh, mesh, camera, screenPointer, rect.width, rect.height);
      if (!picked) { if (!event.shiftKey) setMeshSelection(clearMeshSelection('vertex')); return; }
      setMeshSelection((previous) => {
        const exists = previous.vertexIds.includes(picked.id);
        const vertexIds = event.shiftKey ? (exists ? previous.vertexIds.filter((id) => id !== picked.id) : [...previous.vertexIds, picked.id]) : [picked.id];
        return { mode: 'vertex', vertexIds, edgeIds: [], faceIds: [] };
      });
      return;
    }
    if (meshSelection.mode === 'edge') {
      const picked = pickMeshEdgeScreenSpace(selectedObj.mesh, mesh, camera, screenPointer, rect.width, rect.height);
      if (!picked) { if (!event.shiftKey) setMeshSelection(clearMeshSelection('edge')); return; }
      setMeshSelection((previous) => {
        const exists = previous.edgeIds.includes(picked.id);
        const edgeIds = event.shiftKey ? (exists ? previous.edgeIds.filter((id) => id !== picked.id) : [...previous.edgeIds, picked.id]) : [picked.id];
        return { mode: 'edge', vertexIds: [], edgeIds, faceIds: [] };
      });
      return;
    }
    const projectionForFace = meshProjectionMapRef.current.get(selectedObj.id);
    if (!projectionForFace) return;
    const raycaster = new Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit || hit.faceIndex == null) {
      if (!event.shiftKey) setMeshSelection(clearMeshSelection('face'));
      return;
    }
    const faceId = faceIdFromTriangleIndex(projectionForFace, hit.faceIndex);
    if (!faceId) return;
    setMeshSelection((previous) => toggleFaceSelection(previous, faceId, event.shiftKey));
  };

  const enterEditMode = () => {
    if (!selectedObj) return;
    if (!selectedObj.mesh && selectedObj.type === 'cube') updateSelectedObject({ mesh: createCubeMesh() });
    if (!selectedObj.mesh && selectedObj.type !== 'cube') return;
    setWorkspaceMode('edit');
    setMeshSelection({ mode: 'face', vertexIds: [], edgeIds: [], faceIds: [] });
  };

  const setMeshSelectionMode = (mode: MioMeshSelectionMode) => setMeshSelection({ mode, vertexIds: [], edgeIds: [], faceIds: [] });

  const selectFirstMeshElement = () => {
    if (!selectedObj?.mesh) return;
    if (meshSelection.mode === 'vertex') setMeshSelection({ ...meshSelection, vertexIds: selectedObj.mesh.vertices[0] ? [selectedObj.mesh.vertices[0].id] : [] });
    else if (meshSelection.mode === 'face') setMeshSelection({ ...meshSelection, faceIds: selectedObj.mesh.faces[0] ? [selectedObj.mesh.faces[0].id] : [] });
  };

  const nudgeMeshSelection = (axis: 0 | 1 | 2, amount: number) => {
    if (!selectedObj?.mesh) return;
    const delta: [number, number, number] = [0, 0, 0];
    delta[axis] = amount;
    updateSelectedObject({ mesh: translateMeshSelection(selectedObj.mesh, meshSelection, delta) });
  };

  const extrudeSelectedFace = () => {
    if (!selectedObj?.mesh || meshSelection.mode !== 'face' || meshSelection.faceIds.length !== 1) return;
    const result = extrudeMeshFace(selectedObj.mesh, meshSelection.faceIds[0], extrudeDistance);
    updateSelectedObject({ mesh: result.mesh });
    setMeshSelection({ mode: 'face', vertexIds: [], edgeIds: [], faceIds: [result.capFaceId] });
  };

  const extrudeSelectedRegion = () => {
    if (!selectedObj?.mesh || meshSelection.mode !== 'face' || meshSelection.faceIds.length < 2) return;
    const result = extrudeMeshRegion(selectedObj.mesh, meshSelection.faceIds, extrudeDistance);
    updateSelectedObject({ mesh: result.mesh });
    setMeshSelection({ mode: 'face', vertexIds: [], edgeIds: [], faceIds: result.capFaceIds });
  };

  const insetSelectedFace = () => {
    if (!selectedObj?.mesh || meshSelection.mode !== 'face' || meshSelection.faceIds.length !== 1) return;
    const result = insetMeshFace(selectedObj.mesh, meshSelection.faceIds[0], insetRatio);
    updateSelectedObject({ mesh: result.mesh });
    setMeshSelection({ mode: 'face', vertexIds: [], edgeIds: [], faceIds: [result.insetFaceId] });
  };

  const insetSelectedRegion = () => {
    if (!selectedObj?.mesh || meshSelection.mode !== 'face' || meshSelection.faceIds.length < 2) return;
    const result = insetMeshRegion(selectedObj.mesh, meshSelection.faceIds, insetRatio);
    updateSelectedObject({ mesh: result.mesh });
    setMeshSelection({ mode: 'face', vertexIds: [], edgeIds: [], faceIds: result.insetFaceIds });
  };

  const weldSelectedVertices = () => {
    if (!selectedObj?.mesh || meshSelection.mode !== 'vertex' || meshSelection.vertexIds.length < 2) return;
    const result = weldMeshVertices(selectedObj.mesh, meshSelection.vertexIds);
    updateSelectedObject({ mesh: result.mesh });
    setMeshSelection({ mode: 'vertex', vertexIds: [result.survivorVertexId], edgeIds: [], faceIds: [] });
  };

  const weldSelectedVerticesByDistance = () => {
    if (!selectedObj?.mesh || meshSelection.mode !== 'vertex' || meshSelection.vertexIds.length < 2) return;
    const result = weldMeshVerticesByDistance(selectedObj.mesh, weldDistance, meshSelection.vertexIds);
    updateSelectedObject({ mesh: result.mesh });
    const survivors = result.weldedGroups.length
      ? result.survivorVertexIds
      : meshSelection.vertexIds.filter((id) => result.mesh.vertices.some((vertex) => vertex.id === id));
    setMeshSelection({ mode: 'vertex', vertexIds: survivors, edgeIds: [], faceIds: [] });
  };

  const vectorEditor = (label: string, value: [number, number, number], field: 'position' | 'rotation' | 'scale') => (
    <div>
      <span className="text-gray-400 block text-[10px] mb-1">{label}</span>
      <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((index) => <input key={index} type="number" step="0.1" value={value[index]} onChange={(event) => {
        const next = [...value] as [number, number, number];
        next[index] = parseFloat(event.target.value) || (field === 'scale' ? 0.1 : 0);
        updateSelectedObject({ [field]: next });
      }} className="bg-[#141b2b] border border-gray-700 rounded px-1.5 py-1 text-white text-center text-xs" />)}</div>
    </div>
  );

  return (
    <div className="relative flex h-full w-full bg-[#07090e] overflow-hidden text-xs">
      <CreativeWorkspaceToolbar workspace={workspace} />
      <div className="relative flex-1 h-full flex flex-col">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0d121d]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 font-mono"><Eye size={14} /><span>{workspaceMode.toUpperCase()} MODE // {transformMode.toUpperCase()}</span><span className="text-amber-300 text-[10px] ml-2">LOCAL WEBGL</span></div>
        <div className="absolute left-3 top-12 z-10 flex flex-col gap-1 rounded-lg border border-gray-700 bg-[#0d121d]/90 p-1 font-mono">{(['select', 'move', 'rotate', 'scale'] as const).map((mode) => <button key={mode} onClick={() => setTransformMode(mode)} className={`rounded px-2 py-1 text-left text-[10px] uppercase ${transformMode === mode ? 'bg-cyan-500 text-black' : 'text-gray-300 hover:bg-gray-800'}`}>{mode === 'select' ? 'Q Select' : mode === 'move' ? 'W Move' : mode === 'rotate' ? 'E Rotate' : 'R Scale'}</button>)}</div>
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-gray-700 bg-[#0d121d]/90 p-1 font-mono">
          <button onClick={() => setWorkspaceMode('object')} className={`rounded px-2 py-1 text-[10px] ${workspaceMode === 'object' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>OBJECT</button>
          <button onClick={enterEditMode} disabled={!selectedObj || (!selectedObj.mesh && selectedObj.type !== 'cube')} className={`rounded px-2 py-1 text-[10px] ${workspaceMode === 'edit' ? 'bg-amber-400 text-black' : 'text-gray-300'} disabled:opacity-30`}>EDIT</button>
        </div>
        {workspaceMode === 'edit' && selectedObj?.mesh && <div className="absolute left-28 top-12 z-10 flex items-center gap-1 rounded-lg border border-amber-500/30 bg-[#0d121d]/90 p-1 font-mono">
          {(['vertex','edge','face'] as MioMeshSelectionMode[]).map((mode) => <button key={mode} onClick={() => setMeshSelectionMode(mode)} className={`rounded px-2 py-1 text-[10px] uppercase ${meshSelection.mode === mode ? 'bg-amber-400 text-black' : 'text-gray-300'}`}>{mode}</button>)}
          <button onClick={selectFirstMeshElement} className="rounded border border-gray-700 px-2 py-1 text-[10px] text-cyan-300">Select First</button>
          <button onClick={() => nudgeMeshSelection(0, 0.1)} className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300">X +0.1</button>
          <button onClick={() => nudgeMeshSelection(1, 0.1)} className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300">Y +0.1</button>
          <button onClick={() => nudgeMeshSelection(2, 0.1)} className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300">Z +0.1</button>
          <button onClick={extrudeSelectedFace} disabled={meshSelection.mode !== 'face' || meshSelection.faceIds.length !== 1} className="rounded bg-amber-400 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-30">Extrude Face</button>
          <button onClick={extrudeSelectedRegion} disabled={meshSelection.mode !== 'face' || meshSelection.faceIds.length < 2} className="rounded bg-cyan-400 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-30">Extrude Region</button>
          <button onClick={insetSelectedFace} disabled={meshSelection.mode !== 'face' || meshSelection.faceIds.length !== 1} className="rounded bg-violet-400 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-30">Inset Face</button>
          <button onClick={insetSelectedRegion} disabled={meshSelection.mode !== 'face' || meshSelection.faceIds.length < 2} className="rounded bg-fuchsia-400 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-30">Inset Region</button>
          <button onClick={weldSelectedVertices} disabled={meshSelection.mode !== 'vertex' || meshSelection.vertexIds.length < 2} className="rounded bg-emerald-400 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-30">Weld Vertices</button>
          <button onClick={weldSelectedVerticesByDistance} disabled={meshSelection.mode !== 'vertex' || meshSelection.vertexIds.length < 2} className="rounded bg-lime-400 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-30">Weld Distance</button>
          <input type="number" min="0.0001" step="0.01" value={weldDistance} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next > 0) setWeldDistance(next); }} className="w-14 rounded border border-gray-700 bg-[#141b2b] px-1 py-1 text-[10px] text-white" title="Weld-by-distance threshold" />
          <input type="number" min="0.01" max="0.99" step="0.05" value={insetRatio} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next > 0 && next < 1) setInsetRatio(next); }} className="w-14 rounded border border-gray-700 bg-[#141b2b] px-1 py-1 text-[10px] text-white" title="Inset ratio (0-1)" />
          <input type="number" step="0.05" value={extrudeDistance} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && Math.abs(next) > Number.EPSILON) setExtrudeDistance(next); }} className="w-16 rounded border border-gray-700 bg-[#141b2b] px-1 py-1 text-[10px] text-white" title="Extrude distance; negative values extrude inward" />
          <label className="flex items-center gap-1 px-1 text-[10px] text-gray-300"><input type="checkbox" checked={transformSnapEnabled} onChange={(event) => setTransformSnapEnabled(event.target.checked)} className="accent-amber-400" /> SNAP</label>
          <input type="number" min="0.001" step="0.05" value={transformSnapStep} onChange={(event) => setTransformSnapStep(Math.max(0.001, Number(event.target.value) || 0.1))} className="w-14 rounded border border-gray-700 bg-[#141b2b] px-1 py-1 text-[10px] text-white" title="Transform snap step" />
          <span className="px-2 text-[10px] text-gray-500">V {selectedObj.mesh.vertices.length} / F {selectedObj.mesh.faces.length}</span>
        </div>}
        <div ref={containerRef} onPointerDown={handleViewportPointerDown} className={`w-full flex-1 ${workspaceMode === 'edit' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} />
        <div className="h-10 bg-[#0d121d] border-t border-gray-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2"><span className="text-gray-400 font-mono">ADD:</span>
            <button onClick={() => addObject('cube')} className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"><Box size={12} /> Cube</button>
            <button onClick={() => addObject('sphere')} className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"><Circle size={12} /> Sphere</button>
            <button onClick={() => addObject('cylinder')} className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"><Cylinder size={12} /> Cylinder</button>
          </div>
          <div className="flex items-center gap-1"><button onClick={() => setCameraView('perspective')} className="rounded border border-gray-700 px-2 py-1 text-gray-300">Perspective</button><button onClick={() => setCameraView('front')} className="rounded border border-gray-700 px-2 py-1 text-gray-300">Front</button><button onClick={() => setCameraView('top')} className="rounded border border-gray-700 px-2 py-1 text-gray-300">Top</button><button onClick={() => ExportManager.export3DAsObj(sceneData, 'MIO_Local_Scene.obj')} className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center gap-1.5 cursor-pointer"><Download size={13} /> Export OBJ</button></div>
        </div>
      </div>

      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 flex flex-col font-mono">
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2"><span className="text-gray-300 font-bold flex items-center gap-1.5"><Layers size={14} className="text-cyan-400" /> SCENE OBJECTS ({sceneData.objects.length})</span><button onClick={() => addObject('cube')} className="p-1 hover:bg-gray-800 text-cyan-400 rounded cursor-pointer" title="Add Mesh"><Plus size={14} /></button></div>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">{sceneData.objects.map((object) => <div key={object.id} onClick={() => setSelectedId(object.id)} className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition ${selectedId === object.id ? 'bg-cyan-950/60 border border-cyan-500/50 text-cyan-300' : 'hover:bg-gray-800/60 text-gray-400'}`}><div className="flex items-center gap-2 truncate"><Box size={12} /><span className="truncate">{object.name}</span></div><div className="flex items-center"><button onClick={(event) => { event.stopPropagation(); setSceneData((previous) => ({ ...previous, objects: previous.objects.map((candidate) => candidate.id === object.id ? { ...candidate, visible: candidate.visible === false } : candidate) })); }} className="p-1 text-gray-500 hover:text-cyan-300">{object.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}</button><button onClick={(event) => { event.stopPropagation(); duplicateObject(object.id); }} className="p-1 text-gray-500 hover:text-cyan-300"><Copy size={12} /></button>{sceneData.objects.length > 1 && <button onClick={(event) => { event.stopPropagation(); deleteObject(object.id); }} className="p-1 hover:text-red-400 text-gray-500 rounded"><Trash2 size={12} /></button>}</div></div>)}</div>
        </div>

        {selectedObj ? <div className="flex-1 p-3 overflow-y-auto space-y-4">
          <div><span className="text-gray-400 block text-[10px] mb-1">OBJECT IDENTIFIER</span><input type="text" value={selectedObj.name} onChange={(event) => updateSelectedObject({ name: event.target.value })} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-400" /></div>
          {vectorEditor('SCALE [X, Y, Z]', selectedObj.scale, 'scale')}
          {vectorEditor('POSITION [X, Y, Z]', selectedObj.position, 'position')}
          {vectorEditor('ROTATION [X, Y, Z]', selectedObj.rotation, 'rotation')}
          <div><span className="text-gray-400 block text-[10px] mb-1">MATERIAL COLOR</span><div className="flex gap-2"><input type="color" value={selectedObj.color} onChange={(event) => updateSelectedObject({ color: event.target.value })} className="w-10 h-8 bg-transparent border-0" /><input type="text" value={selectedObj.color} onChange={(event) => updateSelectedObject({ color: event.target.value })} className="flex-1 bg-[#141b2b] border border-gray-700 rounded px-2 text-white" /></div></div>
          <div><span className="text-gray-400 block text-[10px] mb-1">METALNESS: {selectedObj.metalness.toFixed(2)}</span><input type="range" min="0" max="1" step="0.05" value={selectedObj.metalness} onChange={(event) => updateSelectedObject({ metalness: parseFloat(event.target.value) })} className="w-full accent-cyan-400" /></div>
          <div><span className="text-gray-400 block text-[10px] mb-1">ROUGHNESS: {selectedObj.roughness.toFixed(2)}</span><input type="range" min="0" max="1" step="0.05" value={selectedObj.roughness} onChange={(event) => updateSelectedObject({ roughness: parseFloat(event.target.value) })} className="w-full accent-cyan-400" /></div>
          <label className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={selectedObj.wireframe} onChange={(event) => updateSelectedObject({ wireframe: event.target.checked })} className="accent-cyan-400" /> WIREFRAME</label>
        </div> : <div className="flex-1 flex items-center justify-center text-gray-500">No scene object selected.</div>}
      </div>
    </div>
  );
};
