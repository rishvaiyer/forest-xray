import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FootprintProfile } from '../types';

const MAX_RIBBON_POINTS = 180;

function downsample(values: number[], maxPoints: number) {
  if (values.length <= maxPoints) return values;
  const stride = Math.ceil(values.length / maxPoints);
  const sampled: number[] = [];
  for (let i = 0; i < values.length; i += stride) sampled.push(values[i]);
  if (sampled[sampled.length - 1] !== values[values.length - 1]) sampled.push(values[values.length - 1]);
  return sampled;
}

function WaveformRibbon({ values }: { values: number[] }) {
  const sampled = useMemo(() => downsample(values, MAX_RIBBON_POINTS), [values]);
  const max = Math.max(...sampled, 1);
  const line = useMemo(() => {
    const positions = new Float32Array(sampled.length * 3);
    sampled.forEach((v, i) => {
      positions[i * 3] = (i / (sampled.length - 1)) * 4 - 2;
      positions[i * 3 + 1] = (v / max) * 2.5;
      positions[i * 3 + 2] = 0;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x6ee4f0 });
    return new THREE.Line(geo, material);
  }, [sampled, max]);

  return (
    <group position={[-2, 0.5, 0]}>
      <primitive object={line} />
    </group>
  );
}

function ProfileSlices({ coverZ }: { coverZ: number[] }) {
  return (
    <group position={[1.5, 0, 0]}>
      {coverZ.map((cover, i) => {
        const y = (i / (coverZ.length - 1)) * 3;
        return (
          <mesh key={i} position={[0, y, 0]} scale={[cover * 1.2, 0.03, cover * 1.2]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6ee4f0" transparent opacity={0.28 + cover * 0.45} />
          </mesh>
        );
      })}
    </group>
  );
}

function PulseRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() % 2) / 2;
    const scale = 0.5 + t * 2;
    ref.current.scale.set(scale, scale, scale);
    (ref.current.material as THREE.MeshStandardMaterial).opacity = 1 - t;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[0.3, 0.35, 32]} />
      <meshStandardMaterial color="#6ee4f0" transparent opacity={0.8} side={2} />
    </mesh>
  );
}

interface XRayChamberProps {
  profile: FootprintProfile;
  reducedMotion?: boolean;
}

export function XRayChamber({ profile, reducedMotion }: XRayChamberProps) {
  const rh50 = profile.rh_m[49] ?? 0;
  const rh100 = profile.rh_m[99] ?? 0;

  return (
    <div className="xray-chamber" aria-label="Three-dimensional x-ray chamber visualization">
      <Canvas camera={{ position: [0, 2.5, 5], fov: 45 }}>
        <color attach="background" args={['#10151c']} />
        <ambientLight intensity={0.4} />
        <pointLight position={[4, 6, 4]} intensity={1.2} color="#6ee4f0" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[6, 6]} />
          <meshStandardMaterial color="#3a2418" transparent opacity={0.7} />
        </mesh>
        <WaveformRibbon values={profile.waveform_dn} />
        <ProfileSlices coverZ={profile.canopy.cover_z} />
        <mesh position={[1.5, (rh50 / rh100) * 3 || 1.5, 0]}>
          <torusGeometry args={[0.5, 0.02, 8, 32]} />
          <meshStandardMaterial color="#e08a4c" emissive="#e08a4c" emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[1.5, 3, 0]}>
          <torusGeometry args={[0.55, 0.02, 8, 32]} />
          <meshStandardMaterial color="#6ee4f0" emissive="#6ee4f0" emissiveIntensity={0.45} />
        </mesh>
        {!reducedMotion && <PulseRing />}
      </Canvas>
      <div className="xray-chamber-label">Waveform ribbon · cover slices · RH50 / RH100 rings</div>
    </div>
  );
}
