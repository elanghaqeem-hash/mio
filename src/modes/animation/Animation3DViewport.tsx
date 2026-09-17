import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { MioAnimationProject } from '../../types/creative';
import { evaluateAnimationProject } from './AnimationRuntime';
import { evaluateRigWorldTransforms } from './RigTransformEvaluator';

export interface Animation3DViewportProps {
  className?: string;
  project?: MioAnimationProject;
  time?: number;
  selectedRigId?: string;
  selectedBoneId?: string;
  onSelectBone?: (rigId: string, boneId: string) => void;
}

interface BoneVisual {
  rigId: string;
  boneId: string;
  line: THREE.Line;
  head: THREE.Mesh;
}

export const Animation3DViewport: React.FC<Animation3DViewportProps> = ({
  className = '', project, time, selectedRigId, selectedBoneId, onSelectBone,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef(project);
  const timeRef = useRef(time ?? project?.currentTime ?? 0);
  const selectionRef = useRef({ selectedRigId, selectedBoneId });
  const selectRef = useRef(onSelectBone);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { timeRef.current = time ?? project?.currentTime ?? 0; }, [time, project?.currentTime]);
  useEffect(() => { selectionRef.current = { selectedRigId, selectedBoneId }; }, [selectedRigId, selectedBoneId]);
  useEffect(() => { selectRef.current = onSelectBone; }, [onSelectBone]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xbfdcff, 0x18202c, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 7, 5); scene.add(key);
    scene.add(new THREE.GridHelper(20, 40, 0x37516b, 0x202d3b));
    const axes = new THREE.AxesHelper(1.25); axes.position.set(-2.5, 0.01, 2.5); scene.add(axes);

    const rigGroup = new THREE.Group(); rigGroup.name = 'MIO_Evaluated_Rig'; scene.add(rigGroup);
    const boneVisuals: BoneVisual[] = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const normalMaterial = new THREE.LineBasicMaterial({ color: 0x78d7ff });
    const selectedMaterial = new THREE.LineBasicMaterial({ color: 0xffa24a });
    const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x9be7ff });
    const selectedJointMaterial = new THREE.MeshBasicMaterial({ color: 0xffa24a });

    const rebuildRig = () => {
      while (rigGroup.children.length) rigGroup.remove(rigGroup.children[0]);
      boneVisuals.length = 0;
      const current = projectRef.current;
      if (!current?.rigs?.length) return;
      const evaluated = evaluateAnimationProject(current, timeRef.current);
      for (const rig of current.rigs) {
        const local: Record<string, typeof rig.bones[number]['pose']> = {};
        for (const bone of rig.bones) local[bone.id] = evaluated.bonePoses[`${rig.id}:${bone.id}`] ?? bone.pose;
        const world = evaluateRigWorldTransforms(rig, local);
        for (const boneId of world.order) {
          const bone = world.bones[boneId];
          const selected = selectionRef.current.selectedRigId === rig.id && selectionRef.current.selectedBoneId === boneId;
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...bone.head), new THREE.Vector3(...bone.tail),
          ]);
          const line = new THREE.Line(geometry, selected ? selectedMaterial : normalMaterial);
          line.userData = { rigId: rig.id, boneId };
          const head = new THREE.Mesh(new THREE.SphereGeometry(selected ? 0.085 : 0.06, 12, 8), selected ? selectedJointMaterial : jointMaterial);
          head.position.set(...bone.head); head.userData = { rigId: rig.id, boneId };
          rigGroup.add(line, head); boneVisuals.push({ rigId: rig.id, boneId, line, head });
        }
      }
    };

    let azimuth = 0.64, elevation = 0.36, radius = 7.8;
    const target = new THREE.Vector3(0, 1.45, 0);
    let dragging = false, moved = false, pointerId: number | undefined, previousX = 0, previousY = 0;
    const updateCamera = () => {
      const c = Math.cos(elevation);
      camera.position.set(target.x + radius * Math.sin(azimuth) * c, target.y + radius * Math.sin(elevation), target.z + radius * Math.cos(azimuth) * c);
      camera.lookAt(target);
    };
    updateCamera();

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      dragging = true; moved = false; pointerId = event.pointerId; previousX = event.clientX; previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - previousX, dy = event.clientY - previousY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      previousX = event.clientX; previousY = event.clientY;
      if (moved) { azimuth -= dx * 0.008; elevation = THREE.MathUtils.clamp(elevation - dy * 0.008, -1.35, 1.35); updateCamera(); }
    };
    const endPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (!moved && selectRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(boneVisuals.map(item => item.head), false)[0]?.object;
        if (hit?.userData?.rigId && hit.userData?.boneId) selectRef.current(hit.userData.rigId, hit.userData.boneId);
      }
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      pointerId = undefined;
    };
    const onWheel = (event: WheelEvent) => { event.preventDefault(); radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.008, 2.5, 24); updateCamera(); };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', endPointer);
    renderer.domElement.addEventListener('pointercancel', endPointer);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => { const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    let frame = 0;
    const render = () => { frame = requestAnimationFrame(render); rebuildRig(); renderer.render(scene, camera); };
    render();

    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', endPointer); renderer.domElement.removeEventListener('pointercancel', endPointer); renderer.domElement.removeEventListener('wheel', onWheel);
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); if (object instanceof THREE.Line) object.geometry.dispose(); });
      normalMaterial.dispose(); selectedMaterial.dispose(); jointMaterial.dispose(); selectedJointMaterial.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={`absolute inset-0 overflow-hidden bg-[#0d1117] ${className}`} aria-label="3D animation viewport" />;
};
