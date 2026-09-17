import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface Animation3DViewportProps {
  className?: string;
  onBoneSelected?: (boneId: string | null) => void;
}

type Axis = 'x' | 'y' | 'z';

const axisColor: Record<Axis, number> = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 };

export const Animation3DViewport: React.FC<Animation3DViewportProps> = ({ className = '', onBoneSelected }) => {
  const hostRef = useRef<HTMLDivElement>(null);

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
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    scene.add(key);
    scene.add(new THREE.GridHelper(20, 40, 0x37516b, 0x202d3b));
    const axes = new THREE.AxesHelper(1.25);
    axes.position.set(-2.5, 0.01, 2.5);
    scene.add(axes);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x283746, roughness: 0.58, metalness: 0.42 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xffa24a, roughness: 0.38, metalness: 0.35 });
    const mech = new THREE.Group();
    mech.name = 'Vanguard_Mech_Hull';
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.55, 0.72), bodyMaterial); torso.position.y = 1.85; mech.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 18), bodyMaterial); head.position.y = 3.12; mech.add(head);
    const armGeometry = new THREE.CapsuleGeometry(0.12, 1.05, 6, 12);
    const leftArm = new THREE.Mesh(armGeometry, accentMaterial); leftArm.position.set(-0.83, 1.82, 0); leftArm.rotation.z = -0.16; mech.add(leftArm);
    const rightArm = leftArm.clone(); rightArm.position.x = 0.83; rightArm.rotation.z = 0.16; mech.add(rightArm);
    const legGeometry = new THREE.CapsuleGeometry(0.14, 1.2, 6, 12);
    const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial); leftLeg.position.set(-0.34, 0.55, 0); mech.add(leftLeg);
    const rightLeg = leftLeg.clone(); rightLeg.position.x = 0.34; mech.add(rightLeg);
    scene.add(mech);

    // Native pose rig: independent selectable bone controls rendered in true world space.
    const rig = new THREE.Group();
    rig.name = 'rig_vanguard';
    const boneMaterial = new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false, transparent: true, opacity: 0.9 });
    const selectedMaterial = new THREE.MeshBasicMaterial({ color: 0x67e8f9, depthTest: false });
    const boneGeometry = new THREE.CapsuleGeometry(0.055, 0.7, 4, 8);
    const boneMeshes: THREE.Mesh[] = [];
    const addBone = (id: string, position: THREE.Vector3, rotationZ = 0) => {
      const mesh = new THREE.Mesh(boneGeometry, boneMaterial);
      mesh.name = id;
      mesh.userData.boneId = id;
      mesh.position.copy(position);
      mesh.rotation.z = rotationZ;
      mesh.renderOrder = 10;
      rig.add(mesh);
      boneMeshes.push(mesh);
      return mesh;
    };
    addBone('root', new THREE.Vector3(0, 0.65, 0.42));
    addBone('spine', new THREE.Vector3(0, 1.55, 0.42));
    addBone('arm_l', new THREE.Vector3(-0.58, 2.0, 0.42), -0.75);
    addBone('arm_r', new THREE.Vector3(0.58, 2.0, 0.42), 0.75);
    scene.add(rig);

    const gizmo = new THREE.Group();
    gizmo.visible = false;
    const gizmoHandles: THREE.Mesh[] = [];
    (['x', 'y', 'z'] as Axis[]).forEach(axis => {
      const material = new THREE.MeshBasicMaterial({ color: axisColor[axis], depthTest: false });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), material);
      shaft.userData.axis = axis;
      shaft.renderOrder = 20;
      if (axis === 'x') { shaft.rotation.z = -Math.PI / 2; shaft.position.x = 0.38; }
      if (axis === 'y') shaft.position.y = 0.38;
      if (axis === 'z') { shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.38; }
      gizmo.add(shaft); gizmoHandles.push(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 10), material);
      tip.userData.axis = axis;
      tip.renderOrder = 20;
      if (axis === 'x') { tip.rotation.z = -Math.PI / 2; tip.position.x = 0.84; }
      if (axis === 'y') tip.position.y = 0.84;
      if (axis === 'z') { tip.rotation.x = Math.PI / 2; tip.position.z = 0.84; }
      gizmo.add(tip); gizmoHandles.push(tip);
    });
    scene.add(gizmo);

    let selectedBone: THREE.Mesh | null = null;
    let selectedAxis: Axis | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };
    const selectBoneMesh = (mesh: THREE.Mesh | null) => {
      if (selectedBone) selectedBone.material = boneMaterial;
      selectedBone = mesh;
      if (selectedBone) {
        selectedBone.material = selectedMaterial;
        selectedBone.getWorldPosition(gizmo.position);
        gizmo.visible = true;
      } else gizmo.visible = false;
      onBoneSelected?.(selectedBone?.userData.boneId ?? null);
    };

    let azimuth = 0.64, elevation = 0.36, radius = 7.8;
    const target = new THREE.Vector3(0, 1.45, 0);
    let orbiting = false, transforming = false, pointerId: number | undefined, previousX = 0, previousY = 0;
    const updateCamera = () => {
      const c = Math.cos(elevation);
      camera.position.set(target.x + radius * Math.sin(azimuth) * c, target.y + radius * Math.sin(elevation), target.z + radius * Math.cos(azimuth) * c);
      camera.lookAt(target);
    };
    updateCamera();

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      setPointer(event);
      if (gizmo.visible) {
        const handle = raycaster.intersectObjects(gizmoHandles, false)[0]?.object as THREE.Mesh | undefined;
        if (handle?.userData.axis) { transforming = true; selectedAxis = handle.userData.axis as Axis; }
      }
      if (!transforming) {
        const hit = raycaster.intersectObjects(boneMeshes, false)[0]?.object as THREE.Mesh | undefined;
        if (hit) selectBoneMesh(hit);
        else orbiting = true;
      }
      pointerId = event.pointerId; previousX = event.clientX; previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - previousX, dy = event.clientY - previousY;
      previousX = event.clientX; previousY = event.clientY;
      if (transforming && selectedBone && selectedAxis) {
        const amount = (dx - dy) * 0.006;
        selectedBone.position[selectedAxis] += amount;
        selectedBone.getWorldPosition(gizmo.position);
      } else if (orbiting) {
        azimuth -= dx * 0.008;
        elevation = THREE.MathUtils.clamp(elevation - dy * 0.008, -1.35, 1.35);
        updateCamera();
      }
    };
    const endPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      orbiting = false; transforming = false; selectedAxis = null;
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
    const render = () => { frame = requestAnimationFrame(render); renderer.render(scene, camera); };
    render();

    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', endPointer); renderer.domElement.removeEventListener('pointercancel', endPointer); renderer.domElement.removeEventListener('wheel', onWheel);
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(mat => mat.dispose()); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [onBoneSelected]);

  return <div ref={hostRef} className={`absolute inset-0 overflow-hidden bg-[#0d1117] ${className}`} aria-label="3D animation viewport" />;
};
