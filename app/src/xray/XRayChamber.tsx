import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FootprintProfile } from '../types';

function WaveformRibbon({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const points = useMemo(() => {
    return values.map((v, i) => {
      const x = (i / (values.length - 1)) * 4 - 2;
      const y = (v / max) * 2.5;
      return [x, y, 0] as [number, number, number];
    });
  }, [values, max]);

  return (
    <group position={[-2, 0.5, 0]}>
      {points.map((_, i) =>
        i > 0 ? (
          <mesh key={i} position={[(points[i][0] + points[i - 1][0]) / 2, (points[i][1] + points[i - 1][1]) / 2, 0]}>
            <boxGeometry args={[0.04, Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]), 0.04]} />
            <meshStandardMaterial color="#68d9ad" emissive="#68d9ad" emissiveIntensity={0.6} />
          </mesh>
        ) : null,
      )}
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
            <meshStandardMaterial color="#b5ed68" transparent opacity={0.35 + cover * 0.4} />
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
      <meshStandardMaterial color="#b5ed68" transparent opacity={0.8} side={2} />
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
        <color attach="background" args={['#07110f']} />
        <ambientLight intensity={0.4} />
        <pointLight position={[4, 6, 4]} intensity={1.2} color="#b5ed68" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[6, 6]} />
          <meshStandardMaterial color="#3d2a10" transparent opacity={0.6} />
        </mesh>
        <WaveformRibbon values={profile.waveform_dn} />
        <ProfileSlices coverZ={profile.canopy.cover_z} />
        <mesh position={[1.5, (rh50 / rh100) * 3 || 1.5, 0]}>
          <torusGeometry args={[0.5, 0.02, 8, 32]} />
          <meshStandardMaterial color="#ffcb67" emissive="#ffcb67" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[1.5, 3, 0]}>
          <torusGeometry args={[0.55, 0.02, 8, 32]} />
          <meshStandardMaterial color="#b5ed68" emissive="#b5ed68" emissiveIntensity={0.4} />
        </mesh>
        {!reducedMotion && <PulseRing />}
      </Canvas>
      <div className="xray-chamber-label">Measured waveform ribbon · L2B cover slices · RH50/RH100 rings</div>
    </div>
  );
}
