import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Mio3DObject, Mio3DScene } from '../../types/creative';
import { ExportManager } from '../../project/ExportManager';
import { Box, Circle, Cylinder, Layers, Download, Plus, Trash2, Eye, ShieldCheck } from 'lucide-react';
import { eventBus } from '../../core/EventBus';

export const Studio3DView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());

  const [sceneData, setSceneData] = useState<Mio3DScene>({
    objects: [
      {
        id: 'obj_core_1',
        name: 'Vanguard_Mech_Hull',
        type: 'mech_core',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#00f0ff',
        metalness: 0.85,
        roughness: 0.2,
        wireframe: false,
      },
      {
        id: 'obj_wing_l',
        name: 'Thruster_Pod_L',
        type: 'cylinder',
        position: [-1.4, 0.2, -0.4],
        rotation: [0, 0, Math.PI / 4],
        scale: [0.35, 1.2, 0.35],
        color: '#38bdf8',
        metalness: 0.7,
        roughness: 0.3,
        wireframe: false,
      },
      {
        id: 'obj_wing_r',
        name: 'Thruster_Pod_R',
        type: 'cylinder',
        position: [1.4, 0.2, -0.4],
        rotation: [0, 0, -Math.PI / 4],
        scale: [0.35, 1.2, 0.35],
        color: '#38bdf8',
        metalness: 0.7,
        roughness: 0.3,
        wireframe: false,
      },
    ],
    camera: { position: [0, 2.5, 4.5], fov: 50 },
    lights: {
      ambientColor: '#070b14',
      ambientIntensity: 0.8,
      directionalColor: '#00f0ff',
      directionalIntensity: 1.6,
    },
  });

  const [selectedId, setSelectedId] = useState<string>('obj_core_1');
  const selectedObj = sceneData.objects.find((o) => o.id === selectedId);

  // Setup Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090e');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(sceneData.camera.fov, width / height, 0.1, 1000);
    camera.position.set(...sceneData.camera.position);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    containerRef.current.replaceChildren(renderer.domElement);

    // Grid & Ambient Light
    const gridHelper = new THREE.GridHelper(10, 20, 0x00f0ff, 0x1e293b);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    const ambientLight = new THREE.AmbientLight(
      new THREE.Color(sceneData.lights.ambientColor),
      sceneData.lights.ambientIntensity
    );
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(
      new THREE.Color(sceneData.lights.directionalColor),
      sceneData.lights.directionalIntensity
    );
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.8);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Render loop
    let animId: number;
    let t = 0;
    const animate = () => {
      t += 0.01;
      // Gentle auto-turntable rotation
      if (sceneRef.current) {
        sceneRef.current.rotation.y = Math.sin(t * 0.4) * 0.35;
      }
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Synchronize 3D meshes with state
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old meshes
    meshMapRef.current.forEach((mesh) => scene.remove(mesh));
    meshMapRef.current.clear();

    sceneData.objects.forEach((obj) => {
      let geom: THREE.BufferGeometry;

      if (obj.type === 'sphere') {
        geom = new THREE.SphereGeometry(0.7, 32, 32);
      } else if (obj.type === 'cylinder') {
        geom = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24);
      } else if (obj.type === 'torus') {
        geom = new THREE.TorusGeometry(0.7, 0.2, 16, 32);
      } else {
        geom = new THREE.BoxGeometry(1, 1, 1);
      }

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(obj.color),
        metalness: obj.metalness,
        roughness: obj.roughness,
        wireframe: obj.wireframe,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...obj.position);
      mesh.rotation.set(...obj.rotation);
      mesh.scale.set(...obj.scale);

      scene.add(mesh);
      meshMapRef.current.set(obj.id, mesh);
    });
  }, [sceneData]);

  const updateSelectedObject = (updates: Partial<Mio3DObject>) => {
    if (!selectedId) return;
    setSceneData((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => (o.id === selectedId ? { ...o, ...updates } : o)),
    }));
  };

  const handleAddObject = (type: Mio3DObject['type']) => {
    const newObj: Mio3DObject = {
      id: `obj_${Date.now()}`,
      name: `New_${type}_${sceneData.objects.length + 1}`,
      type,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#00f0ff',
      metalness: 0.8,
      roughness: 0.2,
      wireframe: false,
    };
    setSceneData((prev) => ({ ...prev, objects: [...prev.objects, newObj] }));
    setSelectedId(newObj.id);
    eventBus.emit('ACTIVITY_LOG', {
      timestamp: Date.now(),
      message: `Created 3D ${type} primitive: ${newObj.name}`,
      mode: '3D',
    });
  };

  const handleDeleteObject = (id: string) => {
    setSceneData((prev) => ({
      ...prev,
      objects: prev.objects.filter((o) => o.id !== id),
    }));
    if (selectedId === id) {
      setSelectedId(sceneData.objects[0]?.id || '');
    }
  };

  return (
    <div className="flex h-full w-full bg-[#07090e] overflow-hidden text-xs">
      {/* 3D Scene Viewport */}
      <div className="relative flex-1 h-full flex flex-col">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0d121d]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 font-mono">
          <Eye size={14} />
          <span>VIEWPORT: WebGL Accelerated // 60 FPS</span>
          <span className="flex items-center gap-1 text-emerald-400 text-[10px] ml-2">
            <ShieldCheck size={12} /> VERIFIED
          </span>
        </div>

        <div ref={containerRef} className="w-full flex-1 cursor-grab active:cursor-grabbing" />

        {/* Viewport Control Bar */}
        <div className="h-10 bg-[#0d121d] border-t border-gray-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-mono">PRIMITIVES:</span>
            <button
              onClick={() => handleAddObject('cube')}
              className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 hover:border-cyan-500/40 flex items-center gap-1 cursor-pointer"
            >
              <Box size={12} /> Cube
            </button>
            <button
              onClick={() => handleAddObject('sphere')}
              className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 hover:border-cyan-500/40 flex items-center gap-1 cursor-pointer"
            >
              <Circle size={12} /> Sphere
            </button>
            <button
              onClick={() => handleAddObject('cylinder')}
              className="px-2 py-1 bg-gray-800 hover:bg-cyan-900/60 text-cyan-300 rounded border border-gray-700 hover:border-cyan-500/40 flex items-center gap-1 cursor-pointer"
            >
              <Cylinder size={12} /> Cylinder
            </button>
          </div>

          <button
            onClick={() => ExportManager.export3DAsObj(sceneData, 'Vanguard_Mech.obj')}
            className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer"
          >
            <Download size={13} /> Export OBJ
          </button>
        </div>
      </div>

      {/* Right Properties & Scene Tree Panel */}
      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 flex flex-col font-mono">
        {/* Scene Tree */}
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300 font-bold flex items-center gap-1.5">
              <Layers size={14} className="text-cyan-400" /> SCENE OBJECTS ({sceneData.objects.length})
            </span>
            <button
              onClick={() => handleAddObject('cube')}
              className="p-1 hover:bg-gray-800 text-cyan-400 rounded cursor-pointer"
              title="Add Mesh"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {sceneData.objects.map((obj) => (
              <div
                key={obj.id}
                onClick={() => setSelectedId(obj.id)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition ${
                  selectedId === obj.id
                    ? 'bg-cyan-950/60 border border-cyan-500/50 text-cyan-300'
                    : 'hover:bg-gray-800/60 text-gray-400'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Box size={12} />
                  <span className="truncate">{obj.name}</span>
                </div>
                {sceneData.objects.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteObject(obj.id);
                    }}
                    className="p-1 hover:text-red-400 text-gray-500 rounded"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Object Parameters */}
        {selectedObj ? (
          <div className="flex-1 p-3 overflow-y-auto space-y-4">
            <div>
              <span className="text-gray-400 block text-[10px] mb-1">OBJECT IDENTIFIER</span>
              <input
                type="text"
                value={selectedObj.name}
                onChange={(e) => updateSelectedObject({ name: e.target.value })}
                className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-400"
              />
            </div>

            {/* Transform: Scale */}
            <div>
              <span className="text-gray-400 block text-[10px] mb-1">SCALE [X, Y, Z]</span>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((idx) => (
                  <input
                    key={idx}
                    type="number"
                    step="0.1"
                    value={selectedObj.scale[idx]}
                    onChange={(e) => {
                      const newScale = [...selectedObj.scale] as [number, number, number];
                      newScale[idx] = parseFloat(e.target.value) || 0.1;
                      updateSelectedObject({ scale: newScale });
                    }}
                    className="bg-[#141b2b] border border-gray-700 rounded px-1.5 py-1 text-white text-center text-xs"
                  />
                ))}
              </div>
            </div>

            {/* Transform: Position */}
            <div>
              <span className="text-gray-400 block text-[10px] mb-1">POSITION [X, Y, Z]</span>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((idx) => (
                  <input
                    key={idx}
                    type="number"
                    step="0.1"
                    value={selectedObj.position[idx]}
                    onChange={(e) => {
                      const newPos = [...selectedObj.position] as [number, number, number];
                      newPos[idx] = parseFloat(e.target.value) || 0;
                      updateSelectedObject({ position: newPos });
                    }}
                    className="bg-[#141b2b] border border-gray-700 rounded px-1.5 py-1 text-white text-center text-xs"
                  />
                ))}
              </div>
            </div>

            {/* Material Parameters */}
            <div className="space-y-2 border-t border-gray-800 pt-3">
              <span className="text-cyan-400 font-bold block text-[11px]">SURFACE MATERIAL</span>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Color:</span>
                <input
                  type="color"
                  value={selectedObj.color}
                  onChange={(e) => updateSelectedObject({ color: e.target.value })}
                  className="w-7 h-6 rounded cursor-pointer bg-transparent border-0"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-400 text-[10px] mb-1">
                  <span>Metalness:</span>
                  <span>{selectedObj.metalness.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedObj.metalness}
                  onChange={(e) => updateSelectedObject({ metalness: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-400 text-[10px] mb-1">
                  <span>Roughness:</span>
                  <span>{selectedObj.roughness.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedObj.roughness}
                  onChange={(e) => updateSelectedObject({ roughness: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="wireframe"
                  checked={selectedObj.wireframe}
                  onChange={(e) => updateSelectedObject({ wireframe: e.target.checked })}
                  className="accent-cyan-400 rounded"
                />
                <label htmlFor="wireframe" className="text-gray-300 text-[11px] cursor-pointer">
                  Render Wireframe
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500">No object selected</div>
        )}
      </div>
    </div>
  );
};
