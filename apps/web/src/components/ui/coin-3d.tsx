'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
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

// ─── Boring-avatars "beam" reproduction ──────────────────────
// Exact same algorithm as boring-avatars beam variant
const AVATAR_PALETTE = ['#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#10b981'];
const BEAM_SIZE = 36;
const avatarTextureCache = new Map<string, THREE.CanvasTexture>();

function boringHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getDigit(num: number, pos: number): number {
  return Math.floor(num / Math.pow(10, pos)) % 10;
}

function getBoolean(num: number, pos: number): boolean {
  return !(getDigit(num, pos) % 2);
}

function getUnit(num: number, range: number, index?: number): number {
  const value = num % range;
  return index !== undefined && getDigit(num, index) % 2 === 0 ? -value : value;
}

function getContrast(hexColor: string): string {
  const hex = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#FFFFFF';
}

/** Generate beam avatar SVG string — identical to boring-avatars */
function generateBeamSvg(address: string, size: number): string {
  const num = boringHash(address);
  const c = BEAM_SIZE;
  const pLen = AVATAR_PALETTE.length;

  const wrapperColor = AVATAR_PALETTE[num % pLen]!;
  const faceColor = getContrast(wrapperColor);
  const backgroundColor = AVATAR_PALETTE[(num + 13) % pLen]!;

  const tx0 = getUnit(num, 10, 1);
  const wrapperTranslateX = tx0 < 5 ? tx0 + c / 9 : tx0;
  const ty0 = getUnit(num, 10, 2);
  const wrapperTranslateY = ty0 < 5 ? ty0 + c / 9 : ty0;
  const wrapperRotate = getUnit(num, 360);
  const wrapperScale = 1 + getUnit(num, c / 12) / 10;
  const isCircle = getBoolean(num, 1);
  const isMouthOpen = getBoolean(num, 2);
  const eyeSpread = getUnit(num, 5);
  const mouthSpread = getUnit(num, 3);
  const faceRotate = getUnit(num, 10, 3);
  const faceTranslateX = wrapperTranslateX > c / 6 ? wrapperTranslateX / 2 : getUnit(num, 8, 1);
  const faceTranslateY = wrapperTranslateY > c / 6 ? wrapperTranslateY / 2 : getUnit(num, 7, 2);

  const wrapperRx = isCircle ? c : c / 6;
  const wrapperTransform = `translate(${wrapperTranslateX} ${wrapperTranslateY}) rotate(${wrapperRotate} ${c / 2} ${c / 2}) scale(${wrapperScale})`;
  const faceTransform = `translate(${faceTranslateX} ${faceTranslateY}) rotate(${faceRotate} ${c / 2} ${c / 2})`;

  const mouth = isMouthOpen
    ? `<path d="M15 ${19 + mouthSpread}c2 1 4 1 6 0" stroke="${faceColor}" fill="none" stroke-linecap="round"/>`
    : `<path d="M13,${19 + mouthSpread} a1,0.75 0 0,0 10,0" fill="${faceColor}"/>`;

  // Use a hash-based mask ID to avoid collisions
  const maskId = `bm${num}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c} ${c}" width="${size}" height="${size}">
<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${c}" height="${c}">
<rect width="${c}" height="${c}" rx="${c * 2}" fill="#FFFFFF"/>
</mask>
<g mask="url(#${maskId})">
<rect width="${c}" height="${c}" fill="${backgroundColor}"/>
<rect x="0" y="0" width="${c}" height="${c}" fill="${wrapperColor}" rx="${wrapperRx}" transform="${wrapperTransform}"/>
<g transform="${faceTransform}">
${mouth}
<rect x="${14 - eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${faceColor}"/>
<rect x="${20 + eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${faceColor}"/>
</g>
</g>
</svg>`;
}

/** Load boring-avatars beam SVG as a Three.js CanvasTexture (async) */
function loadAvatarTexture(address: string): Promise<THREE.CanvasTexture> {
  const cached = avatarTextureCache.get(address);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const svg = generateBeamSvg(address, 512);
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

    const img = new Image(512, 512);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 512, 512);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      avatarTextureCache.set(address, texture);
      resolve(texture);
    };
    img.src = dataUrl;
  });
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

  // Load avatar textures async (boring-avatars beam → SVG → canvas → texture)
  const [avatarTextures, setAvatarTextures] = useState<{
    maker: THREE.CanvasTexture;
    acceptor: THREE.CanvasTexture;
  } | null>(null);

  useEffect(() => {
    if (!makerAddress || !acceptorAddress) return;
    let cancelled = false;
    Promise.all([
      loadAvatarTexture(makerAddress),
      loadAvatarTexture(acceptorAddress),
    ]).then(([maker, acceptor]) => {
      if (!cancelled) setAvatarTextures({ maker, acceptor });
    });
    return () => { cancelled = true; };
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

  // Swap textures: idle → logo, flipping/landed → avatars
  useEffect(() => {
    if (state === 'flipping' || state === 'landed') {
      if (avatarTextures) {
        // Top cap = maker, bottom cap = acceptor
        // heads (maker wins) → top stays up; tails (acceptor wins) → bottom up
        topMat.map = avatarTextures.maker;
        bottomMat.map = avatarTextures.acceptor;
        topMat.needsUpdate = true;
        bottomMat.needsUpdate = true;
      }
    } else {
      topMat.map = frontTex;
      bottomMat.map = backTex;
      topMat.needsUpdate = true;
      bottomMat.needsUpdate = true;
    }
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

      // Vertical arc (disabled when CSS handles toss motion)
      mesh.position.y = verticalMotion ? maxHeight * 4 * t * (1 - t) : 0;

      // X-axis rotation with deceleration
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
