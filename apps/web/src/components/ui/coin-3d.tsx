'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ─── Defaults ────────────────────────────────────────────────
const RADIUS = 1;
const THICKNESS = 0.12;
const SEGMENTS = 64;
const DEFAULT_FLIP_DURATION = 2.5;
const DEFAULT_TOTAL_SPINS = 7;
const DEFAULT_MAX_HEIGHT = 3.2;
const DEFAULT_IDLE_SPEED = 0.8;

// ─── Types ───────────────────────────────────────────────────
export type CoinState = 'idle' | 'flipping' | 'landed';

interface CoinMeshProps {
  state: CoinState;
  result: 'heads' | 'tails';
  frontTexturePath: string;
  backTexturePath: string;
  spinSpeed?: number;
  flipDuration?: number;
  totalSpins?: number;
  maxHeight?: number;
  verticalMotion?: boolean;
  makerAddress?: string;
  acceptorAddress?: string;
  onComplete?: () => void;
}

// ─── Easing ──────────────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ─── Avatar texture generation ───────────────────────────────
const AVATAR_PALETTE = ['#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
const avatarTextureCache = new Map<string, THREE.CanvasTexture>();

function hashAddress(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) {
    h = ((h << 5) - h + address.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function generateAvatarTexture(address: string): THREE.CanvasTexture {
  const cached = avatarTextureCache.get(address);
  if (cached) return cached;

  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const h = hashAddress(address);

  // Circular clip
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  ctx.clip();

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, AVATAR_PALETTE[h % AVATAR_PALETTE.length]!);
  grad.addColorStop(1, AVATAR_PALETTE[(h >> 4) % AVATAR_PALETTE.length]!);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Beam-like colored circles
  for (let i = 0; i < 4; i++) {
    const seed = Math.abs(h * (i + 2) + i * 17);
    const color = AVATAR_PALETTE[seed % AVATAR_PALETTE.length]!;
    const cx = SIZE * 0.15 + (seed * 7 % (SIZE * 0.7));
    const cy = SIZE * 0.15 + (seed * 11 % (SIZE * 0.7));
    const r = SIZE * 0.12 + (seed * 3 % (SIZE * 0.22));

    ctx.globalAlpha = 0.45 + (seed * 5 % 35) / 100;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  // White border ring
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 5, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  avatarTextureCache.set(address, texture);
  return texture;
}

// ─── Coin mesh with animation ────────────────────────────────
function CoinMesh({
  state,
  result,
  frontTexturePath,
  backTexturePath,
  spinSpeed = DEFAULT_IDLE_SPEED,
  flipDuration = DEFAULT_FLIP_DURATION,
  totalSpins = DEFAULT_TOTAL_SPINS,
  maxHeight = DEFAULT_MAX_HEIGHT,
  verticalMotion = true,
  makerAddress,
  acceptorAddress,
  onComplete,
}: CoinMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const flipStart = useRef(0);
  const completed = useRef(false);

  // Load logo textures
  const textures = useTexture([frontTexturePath, backTexturePath]);
  const frontTex = textures[0] as THREE.Texture;
  const backTex = textures[1] as THREE.Texture;

  // Improve texture quality
  useEffect(() => {
    [frontTex, backTex].forEach((tex) => {
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 16;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
      }
    });
    if (backTex) {
      backTex.center.set(0.5, 0.5);
      backTex.rotation = Math.PI;
    }
  }, [frontTex, backTex]);

  // Generate avatar textures (memoized per address)
  const avatarTextures = useMemo(() => {
    if (!makerAddress || !acceptorAddress) return null;
    return {
      maker: generateAvatarTexture(makerAddress),
      acceptor: generateAvatarTexture(acceptorAddress),
    };
  }, [makerAddress, acceptorAddress]);

  // Materials: [edge, top-cap, bottom-cap]
  const edgeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#c9a227'),
        metalness: 0.95,
        roughness: 0.15,
        envMapIntensity: 1.2,
      }),
    [],
  );

  const topMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: frontTex,
        metalness: 0.5,
        roughness: 0.3,
        envMapIntensity: 0.8,
      }),
    [frontTex],
  );

  const bottomMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: backTex,
        metalness: 0.5,
        roughness: 0.3,
        envMapIntensity: 0.8,
      }),
    [backTex],
  );

  const materials = useMemo(() => [edgeMat, topMat, bottomMat], [edgeMat, topMat, bottomMat]);

  // Swap textures when state changes: idle→logo, flipping/landed→avatars
  useEffect(() => {
    if (!avatarTextures) return;

    if (state === 'flipping' || state === 'landed') {
      // Top cap = maker avatar, bottom cap = acceptor avatar
      // heads (maker wins) → top cap up, tails (acceptor wins) → bottom cap up
      topMat.map = avatarTextures.maker;
      bottomMat.map = avatarTextures.acceptor;
    } else {
      topMat.map = frontTex;
      bottomMat.map = backTex;
    }
    topMat.needsUpdate = true;
    bottomMat.needsUpdate = true;
  }, [state, avatarTextures, topMat, bottomMat, frontTex, backTex]);

  // Reset on flip start
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
      mesh.position.y = 0;
      mesh.rotation.x = 0;
      mesh.rotation.z = 0;
      mesh.rotation.y += delta * spinSpeed;
    } else if (state === 'flipping') {
      const elapsed = performance.now() / 1000 - flipStart.current;
      const t = Math.min(elapsed / flipDuration, 1);

      // Vertical arc (only if verticalMotion enabled — disabled when CSS handles it)
      if (verticalMotion) {
        mesh.position.y = maxHeight * 4 * t * (1 - t);
      } else {
        mesh.position.y = 0;
      }

      // X-axis rotation: fast spin decelerating to correct face
      const eased = easeOutCubic(t);
      const finalAngle =
        result === 'heads'
          ? totalSpins * Math.PI * 2
          : totalSpins * Math.PI * 2 + Math.PI;
      mesh.rotation.x = eased * finalAngle;

      // Wobble for realism (fades out)
      const wobbleFade = (1 - t) * (1 - t);
      mesh.rotation.z = Math.sin(t * 25) * 0.15 * wobbleFade;
      mesh.rotation.y = Math.sin(t * 15) * 0.1 * wobbleFade;

      if (t >= 1 && !completed.current) {
        completed.current = true;
        onComplete?.();
      }
    } else if (state === 'landed') {
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
      <pointLight position={[4, 5, 3]} intensity={80} color="#fff5e0" castShadow />
      <pointLight position={[-3, 3, -1]} intensity={30} color="#e0e8ff" />
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
  spinSpeed?: number;
  cameraPosition?: [number, number, number];
  flipDuration?: number;
  totalSpins?: number;
  maxHeight?: number;
  verticalMotion?: boolean;
  makerAddress?: string;
  acceptorAddress?: string;
}

export function Coin3D({
  state,
  result,
  onFlipComplete,
  size = 160,
  className = '',
  frontTexture = '/coin-token-logo.png',
  backTexture = '/coin-token-logo.back.png',
  spinSpeed,
  cameraPosition = [0, 3.5, 5],
  flipDuration,
  totalSpins,
  maxHeight,
  verticalMotion,
  makerAddress,
  acceptorAddress,
}: Coin3DProps) {
  return (
    <div
      className={`pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <Canvas
        camera={{ position: cameraPosition, fov: 30, near: 0.1, far: 50 }}
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
          spinSpeed={spinSpeed}
          flipDuration={flipDuration}
          totalSpins={totalSpins}
          maxHeight={maxHeight}
          verticalMotion={verticalMotion}
          makerAddress={makerAddress}
          acceptorAddress={acceptorAddress}
          onComplete={onFlipComplete}
        />
      </Canvas>
    </div>
  );
}
