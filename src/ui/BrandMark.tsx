import { brandGlyphPoints } from '../brand/mark';

export function BrandMark({ className = '' }: { className?: string }) {
  return <span className={`brand-mark${className ? ` ${className}` : ''}`} aria-hidden="true">
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
      <polygon points={brandGlyphPoints} />
    </svg>
  </span>;
}