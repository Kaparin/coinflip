'use client';

import { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';

interface Props {
  currentUrl?: string | null;
  onUrlChange: (url: string | null) => void;
  size?: number;
}

/**
 * Converts selected image file to a data:URI (base64) for immediate preview & storage.
 * For a production file upload service, replace with presigned URL upload.
 */
export function TeamAvatarPicker({ currentUrl, onUrlChange, size = 64 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return; // Max 2MB

    setLoading(true);
    try {
      // Resize to 256x256 and convert to base64
      const dataUrl = await resizeImage(file, 256);
      setPreview(dataUrl);
      onUrlChange(dataUrl);
    } catch {
      // Fallback: use original as-is
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setPreview(result);
        onUrlChange(result);
      };
      reader.readAsDataURL(file);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUrlChange(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-3">
      {/* Preview */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative group shrink-0"
        style={{ width: size, height: size }}
      >
        {preview ? (
          <img
            src={preview}
            alt="Team avatar"
            className="w-full h-full rounded-xl object-cover border border-[var(--color-border)]"
          />
        ) : (
          <div className="w-full h-full rounded-xl bg-[var(--color-bg)] border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
            {loading ? (
              <Loader2 size={20} className="text-[var(--color-text-secondary)] animate-spin" />
            ) : (
              <Camera size={20} className="text-[var(--color-text-secondary)]" />
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={16} className="text-white" />
        </div>
      </button>

      {/* Remove button */}
      {preview && (
        <button
          type="button"
          onClick={handleRemove}
          className="p-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-red-500/30 hover:text-red-400 text-[var(--color-text-secondary)] transition-colors"
        >
          <X size={14} />
        </button>
      )}

      {/* Hidden input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

/** Resize image to maxSize x maxSize using canvas */
function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      // Center crop
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, maxSize, maxSize);

      resolve(canvas.toDataURL('image/webp', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
