'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ─── Coin dimensions & animation config ──────────────────────
const RADIUS = 1;
const THICKNESS = 0.12;
const SEGMENTS = 64;

const FLIP_DURATION = 2.8;     // seconds
const MAX_HEIGHT = 3.2;        // peak of the arc
const TOTAL_SPINS = 8;         // full rotations during flip
const IDLE_SPIN_SPEED = 0.8;   // radians/sec for idle rotation

// ─── Types ───────────────────────────────────────────────────
export type CoinState = 'idle' | 'flipping' | 'landed';

interface CoinMeshProps {
  state: CoinState;
  result: 'heads' | 'tails';
  frontTexturePath: string;
  backTexturePath: string;
  onComplete?: () => void;
}

// ─── Easing: cubic ease-out ──────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ─── Coin mesh with animation ────────────────────────────────
function CoinMesh({ state, result, frontTexturePath, backTexturePath, onComplete }: CoinMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const flipStart = useRef(0);
  const completed = useRef(false);

  // Load textures
  const textures = useTexture([frontTexturePath, backTexturePath]);
  const frontTex = textures[0] as THREE.Texture;
  const backTex = textures[1] as THREE.Texture;

  // Fix back texture mirroring (bottom cap UVs are flipped)
  useEffect(() => {
    if (backTex) {
      backTex.center.set(0.5, 0.5);
      backTex.rotation = Math.PI;
    }
  }, [backTex]);

  // Materials: [side-edge, top-cap(heads), bottom-cap(tails)]
  const materials = useMemo(() => [
    // Edge — polished gold metal
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c9a227'),
      metalness: 0.95,
      roughness: 0.15,
      envMapIntensity: 1.2,
    }),
    // Heads (top cap)
    new THREE.MeshStandardMaterial({
      map: frontTex,
      metalness: 0.5,
      roughness: 0.3,
      envMapIntensity: 0.8,
    }),
    // Tails (bottom cap)
    new THREE.MeshStandardMaterial({
      map: backTex,
      metalness: 0.5,
      roughness: 0.3,
      envMapIntensity: 0.8,
    }),
  ], [frontTex, backTex]);

  // Reset on state change
  useEffect(() => {
    if (state === 'flipping') {
      flipStart.current = performance.now() / 1000;
      completed.current = false;
    }
  }, [state]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (state === 'idle') {
      // Gentle Y-axis spin, lying flat
      mesh.position.y = 0;
      mesh.rotation.x = 0;
      mesh.rotation.z = 0;
      mesh.rotation.y += delta * IDLE_SPIN_SPEED;
    } else if (state === 'flipping') {
      const elapsed = performance.now() / 1000 - flipStart.current;
      const t = Math.min(elapsed / FLIP_DURATION, 1);

      // Parabolic height arc: 0 → MAX_HEIGHT → 0
      mesh.position.y = MAX_HEIGHT * 4 * t * (1 - t);

      // X-axis rotation: fast spin then decelerate to correct face
      const eased = easeOutCubic(t);
      // heads = land with top cap up (x=0 mod 2π)
      // tails = land with bottom cap up (x=π mod 2π)
      const finalAngle = result === 'heads'
        ? TOTAL_SPINS * Math.PI * 2
        : TOTAL_SPINS * Math.PI * 2 + Math.PI;
      mesh.rotation.x = eased * finalAngle;

      // Wobble on Z/Y for realism (fades out as coin lands)
      const wobbleFade = (1 - t) * (1 - t); // quadratic fade
      mesh.rotation.z = Math.sin(t * 25) * 0.12 * wobbleFade;
      mesh.rotation.y = Math.sin(t * 15) * 0.08 * wobbleFade;

      if (t >= 1 && !completed.current) {
        completed.current = true;
        onComplete?.();
      }
    } else if (state === 'landed') {
      // Static on final face
      mesh.position.y = 0;
      mesh.rotation.x = result === 'heads' ? 0 : Math.PI;
      mesh.rotation.y = 0;
      mesh.rotation.z = 0;
    }
  });

  return (
    <mesh ref={meshRef} material={materials} castShadow>
      <cylinderGeometry args={[RADIUS, RADIUS, THICKNESS, SEGMENTS]} />
    </mesh>
  );
}

// ─── Scene lighting ──────────────────────────────────────────
function Lights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      {/* Key light — warm, from upper-right */}
      <pointLight position={[4, 5, 3]} intensity={80} color="#fff5e0" castShadow />
      {/* Fill light — cool, from left */}
      <pointLight position={[-3, 3, -1]} intensity={30} color="#e0e8ff" />
      {/* Gold rim light — behind and below */}
      <pointLight position={[0, -2, -3]} intensity={20} color="#ffd700" />
    </>
  );
}

// ─── Public component ────────────────────────────────────────
export interface Coin3DProps {
  state: CoinState;
  result: 'heads' | 'tails';
  onFlipComplete?: () => void;
  size?: number;
  className?: string;
  frontTexture?: string;
  backTexture?: string;
}

export function Coin3D({
  state,
  result,
  onFlipComplete,
  size = 160,
  className = '',
  frontTexture = '/coin-token-logo.png',
  backTexture = '/coin-token-logo.back.png',
}: Coin3DProps) {
  return (
    <div
      className={`pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <Canvas
        camera={{ position: [0, 3.5, 5], fov: 30, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
      >
        <Lights />
        <Environment preset="city" environmentIntensity={0.3} />
        <CoinMesh
          state={state}
          result={result}
          frontTexturePath={frontTexture}
          backTexturePath={backTexture}
          onComplete={onFlipComplete}
        />
      </Canvas>
    </div>
  );
}
