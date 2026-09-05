import { Icon } from './Icon';
import { BrandMark } from './BrandMark';

// Keep the visible layout stable across session, lazy module and local-data loading.
export function LoadingScreen({ detail }: { detail: string }) {
  return <main className="loading-screen" aria-label="Đang mở Nôi" aria-busy="true">
    <div className="loading-content">
      <BrandMark className="loading-mark" />
      <span className="brand loading-brand">nôi.</span>
      <p className="loading-tagline">Từng điều nhỏ, cùng con lớn lên.</p>
      <div className="loading-status" role="status" aria-atomic="true">
        <Icon name="loading" />
        <span>Đang mở nhật ký…<span className="sr-only"> {detail}</span></span>
      </div>
    </div>
  </main>;
}