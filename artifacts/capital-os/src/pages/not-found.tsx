import { ArrowUpRight, CircleHelp } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="content" style={{ minHeight: 'calc(100dvh - 78px)', display: 'grid', placeItems: 'center' }}>
      <div className="empty-state" style={{ width: 'min(100%, 520px)' }}>
        <CircleHelp size={27} />
        <div className="eyebrow">Capital OS / misplaced note</div>
        <h3 data-testid="text-not-found-title">This page took a wrong turn.</h3>
        <p>The workspace is still here. Head back to your overview and pick up the thread.</p>
        <Link href="/" className="btn btn-primary" data-testid="link-return-overview">Return to overview <ArrowUpRight size={14} /></Link>
      </div>
    </div>
  );
}
