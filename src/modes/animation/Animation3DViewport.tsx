import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface Animation3DViewportProps {
  className?: string;
}

export const Animation3DViewport: React.FC<Animation3DViewportProps> = ({ className = '' }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(4.8, 3.2, 6.5);
    camera.lookAt(0, 1.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xbfdcff, 0x18202c, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    scene.add(key);

    const grid = new THREE.GridHelper(20, 40, 0x37516b, 0x202d3b);
    scene.add(grid);

    const axes = new THREE.AxesHelper(1.25);
    axes.position.set(-2.5, 0.01, 2.5);
    scene.add(axes);

    const material = new THREE.MeshStandardMaterial({ color: 0x283746, roughness: 0.58, metalness: 0.42 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xffa24a, roughness: 0.38, metalness: 0.35 });
    const mech = new THREE.Group();
    mech.name = 'Vanguard_Mech_Hull';

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.55, 0.72), material);
    torso.position.y = 1.85;
    mech.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 18), material);
    head.position.y = 3.12;
    mech.add(head);

    const limbGeometry = new THREE.CapsuleGeometry(0.12, 1.05, 6, 12);
    const leftArm = new THREE.Mesh(limbGeometry, accent);
    leftArm.position.set(-0.83, 1.82, 0);
    leftArm.rotation.z = -0.16;
    mech.add(leftArm);
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.83;
    rightArm.rotation.z = 0.16;
    mech.add(rightArm);

    const legGeometry = new THREE.CapsuleGeometry(0.14, 1.2, 6, 12);
    const leftLeg = new THREE.Mesh(legGeometry, material);
    leftLeg.position.set(-0.34, 0.55, 0);
    mech.add(leftLeg);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.34;
    mech.add(rightLeg);
    scene.add(mech);

    let azimuth = 0.64;
    let elevation = 0.36;
    let radius = 7.8;
    const target = new THREE.Vector3(0, 1.45, 0);
    let dragging = false;
    let pointerId: number | undefined;
    let previousX = 0;
    let previousY = 0;

    const updateCamera = () => {
      const cosElevation = Math.cos(elevation);
      camera.position.set(
        target.x + radius * Math.sin(azimuth) * cosElevation,
        target.y + radius * Math.sin(elevation),
        target.z + radius * Math.cos(azimuth) * cosElevation,
      );
      camera.lookAt(target);
    };
    updateCamera();

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      dragging = true;
      pointerId = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - previousX;
      const dy = event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      azimuth -= dx * 0.008;
      elevation = THREE.MathUtils.clamp(elevation - dy * 0.008, -1.35, 1.35);
      updateCamera();
    };
    const endPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      pointerId = undefined;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.008, 2.5, 24);
      updateCamera();
    };

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', endPointer);
    renderer.domElement.addEventListener('pointercancel', endPointer);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', endPointer);
      renderer.domElement.removeEventListener('pointercancel', endPointer);
      renderer.domElement.removeEventListener('wheel', onWheel);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const mats = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach(mat => mat.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={`absolute inset-0 overflow-hidden bg-[#0d1117] ${className}`} aria-label="3D animation viewport" />
  );
};
