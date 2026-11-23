import React, { useState } from 'react';
import { ImageOff, X, ZoomIn } from 'lucide-react';
import { formatCbtRichText } from '../utils/mathFormat';

export function RichText({
  text,
  className = '',
}: {
  text: string | undefined | null;
  className?: string;
}) {
  if (!text) return null;
  return (
    <div
      className={`leading-relaxed break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: formatCbtRichText(text) }}
    />
  );
}

function getImageCandidates(rawUrl: string): string[] {
  const url = rawUrl.trim();
  if (!url) return [];
  const driveMatch =
    url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (!driveMatch) return [url];
  const id = driveMatch[1];
  const candidates = [
    url,
    `https://lh3.googleusercontent.com/d/${id}=w1200`,
    `https://drive.google.com/thumbnail?sz=w1200&id=${id}`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ];
  return Array.from(new Set(candidates));
}

export function CbtImage({
  src,
  alt,
  className = 'max-h-72',
  onZoom,
}: {
  src: string | undefined | null;
  alt: string;
  className?: string;
  onZoom?: (url: string, alt: string) => void;
}) {
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setCandidateIdx(0);
  }

  if (!src || !src.trim()) return null;
  const candidates = getImageCandidates(src);
  const activeSrc = candidates[candidateIdx];

  if (!activeSrc) {
    return (
      <div className="my-2 p-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center gap-3 text-slate-500 text-xs">
        <ImageOff className="w-5 h-5 shrink-0 text-slate-400" />
        <span>Gambar tidak dapat dimuat ({alt})</span>
      </div>
    );
  }

  return (
    <div className="my-2 inline-block relative group">
      <img
        src={activeSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setCandidateIdx((i) => i + 1)}
        onClick={(e) => {
          if (onZoom) {
            e.preventDefault();
            e.stopPropagation();
            onZoom(activeSrc, alt);
          }
        }}
        className={`rounded-lg border border-slate-200 max-w-full object-contain bg-white ${
          onZoom ? 'cursor-zoom-in' : ''
        } ${className}`}
      />
      {onZoom && (
        <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2 right-2 bg-slate-900/75 text-white text-[11px] px-2 py-1 rounded flex items-center gap-1">
          <ZoomIn className="w-3 h-3" /> Perbesar
        </span>
      )}
    </div>
  );
}

export function ImageLightbox({
  image,
  onClose,
}: {
  image: { url: string; alt: string } | null;
  onClose: () => void;
}) {
  if (!image) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup pratinjau gambar"
        className="fixed top-4 right-4 bg-white text-slate-900 rounded-lg p-2 shadow-lg hover:bg-slate-100 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={image.url}
        alt={image.alt}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[88vh] rounded-lg bg-white object-contain shadow-2xl"
      />
    </div>
  );
}
