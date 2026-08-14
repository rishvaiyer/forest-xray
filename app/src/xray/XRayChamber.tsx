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
        const y = (1 - i / (coverZ.length - 1)) * 3;
        return (
          <mesh key={i} position={[0, y, 0]} scale={[cover * 1.2, 0.04, cover * 1.2]}>
            <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
            <meshStandardMaterial color="#6ee4f0" transparent opacity={0.22 + cover * 0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

function FallingPulse({ playKey, reducedMotion }: { playKey: string; reducedMotion?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const lastKey = useRef(playKey);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (lastKey.current !== playKey || start.current == null) {
      lastKey.current = playKey;
      start.current = clock.getElapsedTime();
    }
    if (reducedMotion) {
      ref.current.visible = false;
      return;
    }
    const elapsed = clock.getElapsedTime() - start.current;
    const t = Math.min(1, elapsed / 1.6);
    ref.current.visible = t < 1;
    ref.current.position.y = 3.4 - t * 3.4;
    (ref.current.material as THREE.MeshStandardMaterial).opacity = 0.9 - t * 0.7;
  });

  return (
    <mesh ref={ref} position={[1.5, 3.4, 0]}>
      <sphereGeometry args={[0.08, 12, 12]} />
      <meshStandardMaterial color="#e8f7fb" emissive="#6ee4f0" emissiveIntensity={1.4} transparent />
    </mesh>
  );
}

function InspectPlane({ inspectT }: { inspectT: number | null }) {
  if (inspectT == null) return null;
  return (
    <mesh position={[1.5, inspectT * 3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.15, 0.72, 32]} />
      <meshStandardMaterial color="#e08a4c" transparent opacity={0.85} side={2} />
    </mesh>
  );
}

interface XRayChamberProps {
  profile: FootprintProfile;
  reducedMotion?: boolean;
  inspectT?: number | null;
  playKey?: string;
}

export function XRayChamber({ profile, reducedMotion, inspectT = null, playKey = profile.shot }: XRayChamberProps) {
  const rh50 = profile.rh_m[49] ?? 0;
  const rh100 = profile.rh_m[99] ?? 0;

  return (
    <div className="xray-chamber" aria-label="Laser pulse traveling through the canopy">
      <Canvas camera={{ position: [0, 2.2, 5.2], fov: 42 }}>
        <color attach="background" args={['#10151c']} />
        <ambientLight intensity={0.45} />
        <pointLight position={[4, 6, 4]} intensity={1.3} color="#6ee4f0" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[2.4, 48]} />
          <meshStandardMaterial color="#3a2418" transparent opacity={0.85} />
        </mesh>
        <WaveformRibbon values={profile.waveform_dn} />
        <ProfileSlices coverZ={profile.canopy.cover_z} />
        <mesh position={[1.5, (rh50 / rh100) * 3 || 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.018, 8, 32]} />
          <meshStandardMaterial color="#e08a4c" emissive="#e08a4c" emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[1.5, 3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.62, 0.018, 8, 32]} />
          <meshStandardMaterial color="#6ee4f0" emissive="#6ee4f0" emissiveIntensity={0.45} />
        </mesh>
        <InspectPlane inspectT={inspectT} />
        <FallingPulse playKey={playKey} reducedMotion={reducedMotion} />
      </Canvas>
      <div className="xray-chamber-label">A pulse falls through the layers. Wider discs mean more leaves at that height.</div>
    </div>
  );
}
