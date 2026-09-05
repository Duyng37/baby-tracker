import { duration, type summarize } from '../domain/summary';
import { Icon } from './Icon';

export function Metrics({ summary }: { summary: ReturnType<typeof summarize> }) {
  return <div className="stats">
    <article className="card metric"><small><Icon name="bottle" /> Sữa bình</small><strong>{summary.bottle} <span>ml</span></strong><p>Lượng sữa đã ghi</p></article>
    <article className="card metric"><small><Icon name="diaper" /> Thay tã</small><strong>{summary.diapers} <span>lần</span></strong><p>Những lần thay tã</p></article>
    <article className="card metric"><small><Icon name="sleep" /> Giấc ngủ</small><strong>{duration(summary.sleep)}</strong><p>Từng khoảng nghỉ của con</p></article>
    <article className="card metric"><small><Icon name="breast" /> Bú mẹ</small><strong>{duration(summary.breast)}</strong><p>Thời gian bên mẹ</p></article>
  </div>;
}