import React, { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { Mio3DObject, Mio3DScene } from '../../types/creative';
import { ExportManager } from '../../project/ExportManager';
import { Box, Circle, Cylinder, Layers, Download, Plus, Trash2, Eye } from 'lucide-react';
import { eventBus } from '../../core/EventBus';

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
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const [sceneData, setSceneData] = useState<Mio3DScene>(INITIAL_SCENE);
  const [selectedId, setSelectedId] = useState('obj_core_1');
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
    let phase = 0;
    const animate = () => {
      phase += 0.01;
      scene.rotation.y = Math.sin(phase * 0.4) * 0.35;
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
      renderer.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
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

    for (const object of sceneData.objects) {
      let geometry: BufferGeometry;
      if (object.type === 'sphere') geometry = new SphereGeometry(0.7, 32, 32);
      else if (object.type === 'cylinder') geometry = new CylinderGeometry(0.5, 0.5, 1.2, 24);
      else if (object.type === 'torus') geometry = new TorusGeometry(0.7, 0.2, 16, 32);
      else geometry = new BoxGeometry(1, 1, 1);
      const material = new MeshStandardMaterial({ color: new Color(object.color), metalness: object.metalness, roughness: object.roughness, wireframe: object.wireframe });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(...object.position);
      mesh.rotation.set(...object.rotation);
      mesh.scale.set(...object.scale);
      scene.add(mesh);
      meshMapRef.current.set(object.id, mesh);
    }
  }, [sceneData.objects]);

  const updateSelectedObject = (updates: Partial<Mio3DObject>) => {
    if (!selectedId) return;
    setSceneData((previous) => ({ ...previous, objects: previous.objects.map((object) => object.id === selectedId ? { ...object, ...updates } : object) }));
  };

  const addObject = (type: Mio3DObject['type']) => {
    const sequence = sceneData.objects.length + 1;
    const object: Mio3DObject = { id: `obj_${type}_${sequence}`, name: `New_${type}_${sequence}`, type, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#00f0ff', metalness: 0.8, roughness: 0.2, wireframe: false };
    setSceneData((previous) => ({ ...previous, objects: [...previous.objects, object] }));
    setSelectedId(object.id);
    eventBus.emit('ACTIVITY_LOG', { timestamp: activityTimestamp(), message: `Created local 3D ${type} primitive: ${object.name}`, mode: '3D' });
  };

  const deleteObject = (id: string) => {
    setSceneData((previous) => {
      const objects = previous.objects.filter((object) => object.id !== id);
      if (selectedId === id) setSelectedId(objects[0]?.id ?? '');
      return { ...previous, objects };
    });
  };

  const vectorEditor = (label: string, value: [number, number, number], field: 'position' | 'scale') => (
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
    <div className="flex h-full w-full bg-[#07090e] overflow-hidden text-xs">
      <div className="relative flex-1 h-full flex flex-col">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0d121d]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 font-mono"><Eye size={14} /><span>VIEWPORT: LOCAL WEBGL PREVIEW</span><span className="text-amber-300 text-[10px] ml-2">FPS NOT BENCHMARKED</span></div>
        <div ref={containerRef} className="w-full flex-1 cursor-grab active:cursor-grabbing" />
        <div className="h-10 bg-[#0d121d] border-t border-gray-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2"><span className="text-gray-400 font-mono">PRIMITIVES:</span>
            <button onClick={() => addObject('cube')} className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"><Box size={12} /> Cube</button>
            <button onClick={() => addObject('sphere')} className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"><Circle size={12} /> Sphere</button>
            <button onClick={() => addObject('cylinder')} className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"><Cylinder size={12} /> Cylinder</button>
          </div>
          <button onClick={() => ExportManager.export3DAsObj(sceneData, 'MIO_Local_Scene.obj')} className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center gap-1.5 cursor-pointer"><Download size={13} /> Export OBJ</button>
        </div>
      </div>

      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 flex flex-col font-mono">
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2"><span className="text-gray-300 font-bold flex items-center gap-1.5"><Layers size={14} className="text-cyan-400" /> SCENE OBJECTS ({sceneData.objects.length})</span><button onClick={() => addObject('cube')} className="p-1 hover:bg-gray-800 text-cyan-400 rounded cursor-pointer" title="Add Mesh"><Plus size={14} /></button></div>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">{sceneData.objects.map((object) => <div key={object.id} onClick={() => setSelectedId(object.id)} className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition ${selectedId === object.id ? 'bg-cyan-950/60 border border-cyan-500/50 text-cyan-300' : 'hover:bg-gray-800/60 text-gray-400'}`}><div className="flex items-center gap-2 truncate"><Box size={12} /><span className="truncate">{object.name}</span></div>{sceneData.objects.length > 1 && <button onClick={(event) => { event.stopPropagation(); deleteObject(object.id); }} className="p-1 hover:text-red-400 text-gray-500 rounded"><Trash2 size={12} /></button>}</div>)}</div>
        </div>

        {selectedObj ? <div className="flex-1 p-3 overflow-y-auto space-y-4">
          <div><span className="text-gray-400 block text-[10px] mb-1">OBJECT IDENTIFIER</span><input type="text" value={selectedObj.name} onChange={(event) => updateSelectedObject({ name: event.target.value })} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-400" /></div>
          {vectorEditor('SCALE [X, Y, Z]', selectedObj.scale, 'scale')}
          {vectorEditor('POSITION [X, Y, Z]', selectedObj.position, 'position')}
          <div><span className="text-gray-400 block text-[10px] mb-1">MATERIAL COLOR</span><div className="flex gap-2"><input type="color" value={selectedObj.color} onChange={(event) => updateSelectedObject({ color: event.target.value })} className="w-10 h-8 bg-transparent border-0" /><input type="text" value={selectedObj.color} onChange={(event) => updateSelectedObject({ color: event.target.value })} className="flex-1 bg-[#141b2b] border border-gray-700 rounded px-2 text-white" /></div></div>
          <div><span className="text-gray-400 block text-[10px] mb-1">METALNESS: {selectedObj.metalness.toFixed(2)}</span><input type="range" min="0" max="1" step="0.05" value={selectedObj.metalness} onChange={(event) => updateSelectedObject({ metalness: parseFloat(event.target.value) })} className="w-full accent-cyan-400" /></div>
          <div><span className="text-gray-400 block text-[10px] mb-1">ROUGHNESS: {selectedObj.roughness.toFixed(2)}</span><input type="range" min="0" max="1" step="0.05" value={selectedObj.roughness} onChange={(event) => updateSelectedObject({ roughness: parseFloat(event.target.value) })} className="w-full accent-cyan-400" /></div>
          <label className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={selectedObj.wireframe} onChange={(event) => updateSelectedObject({ wireframe: event.target.checked })} className="accent-cyan-400" /> WIREFRAME</label>
        </div> : <div className="flex-1 flex items-center justify-center text-gray-500">No scene object selected.</div>}
      </div>
    </div>
  );
};
