import {
  useListFinancialDocuments,
  useListFinancialReviewQueue,
  useReviewFinancialDocument,
  useReviewBankStatementTransaction,
} from '@workspace/api-client-react';
import { 
  ClipboardList, 
  CheckCircle2, 
  FileText,
  Check,
  X,
  ArrowRightLeft
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { useRef } from 'react';
import {
  normalizeReviewQueueItem,
  queueItemDestination,
  queueItemDetail,
  queueItemTitle,
  type ReviewQueueItem,
} from '@/documents-queue';

const PageHeading = ({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) => (
  <div className="page-heading animate-in">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1 data-testid="text-page-title">{title}</h1>
      {description && <p>{description}</p>}
    </div>
  </div>
);

const CardTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="card-title-row">
    <div>
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
    </div>
  </div>
);

export default function DocumentsPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { data: docsData, refetch: refetchDocs } = useListFinancialDocuments();
  const { data: queueData, refetch: refetchQueue } = useListFinancialReviewQueue();
  const reviewDoc = useReviewFinancialDocument();
  const reviewTx = useReviewBankStatementTransaction();
  const reviewKeys = useRef(new Map<string, string>());

  const documents = docsData?.documents || [];
  const queueItems = (queueData?.items || []).map(normalizeReviewQueueItem);

  const handleDocReview = async (id: string, decision: 'VERIFIED' | 'REJECTED', reason: string) => {
    try {
      await reviewDoc.mutateAsync({
        documentId: id,
        data: { decision, reason }
      });
      toast({ title: `Document ${decision.toLowerCase()}` });
      refetchDocs();
      refetchQueue();
    } catch (err: any) {
      toast({ title: 'Review failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleTxReview = async (
    id: string,
    action: 'APPROVE' | 'REJECT' | 'RECLASSIFY' | 'MARK_TRANSFER',
    reason: string,
    correctedValue?: Record<string, unknown>,
  ) => {
    const key = `${id}:${action}`;
    const idempotencyKey = reviewKeys.current.get(key) ?? crypto.randomUUID();
    reviewKeys.current.set(key, idempotencyKey);
    try {
      await reviewTx.mutateAsync({
        transactionId: id,
        data: { 
          action, 
          reason,
          idempotencyKey,
          correctedValue,
        }
      });
      toast({ title: `Transaction action: ${action.toLowerCase()}` });
      refetchQueue();
      refetchDocs();
      reviewKeys.current.delete(key);
    } catch (err: any) {
      toast({ title: 'Review failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      {!embedded && <PageHeading 
        eyebrow="Operations" 
        title="Financial Inbox" 
        description="Review parsed documents and transactions. Parsed never means verified." 
      />}
      
      <div className="document-inbox-layout">
        <div className="grid gap-[18px]">
          <div className="card card-pad animate-in delay-1">
            <CardTitle title="Credit card payment treatment" subtitle="Excluded from budget if purchases are counted." />
            <p className="text-sm text-[var(--ink-soft)]">
              A card payment is reviewed as a transfer when its underlying purchases are already included, preventing the same spending from being counted twice.
            </p>
          </div>
          <div className="card card-pad page-section animate-in delay-1">
              <CardTitle title="Review Queue" subtitle="Human confirmation only — no auto-posting and no bank writes." />
            
            {queueItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><CheckCircle2 size={20} /></div>
                <div className="empty-title">Inbox Zero</div>
                <p>No documents or transactions waiting for review.</p>
              </div>
            ) : (
                <div className="document-list">
                  {queueItems.map((item, idx) => (
                   <div key={item?.id || idx} className="document-row" data-testid={`row-queue-item-${idx}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={14} className="text-[var(--ink-soft)]" />
                         <strong>{item ? queueItemTitle(item) : 'Unsupported review item'}</strong>
                        <span className="status pending">Needs Review</span>
                      </div>
                      
                      <div className="text-xs text-[var(--ink-soft)]">
                         {item ? queueItemDetail(item) : 'Specialized review is required. This item cannot be actioned from Documents.'}
                      </div>
                    </div>
                    
                    <div className="document-actions">
                       <QueueItemActions item={item} handleDocReview={handleDocReview} handleTxReview={handleTxReview} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-[18px] content-start">
          <div className="card card-pad page-section animate-in delay-2">
            <CardTitle title="Document Library" subtitle="All uploaded financial evidence." />
            
            {documents.length === 0 ? (
               <div className="text-sm text-[var(--ink-soft)] text-center py-4">No documents uploaded yet.</div>
            ) : (
              <div className="document-list">
                {documents.map(doc => (
                  <div key={doc.id} className="document-row !py-2 !items-start">
                    <div className="min-w-0 flex-1">
                      <strong className="truncate block" title={doc.sourceFileName}>{doc.sourceFileName}</strong>
                      <span className="truncate block">{doc.documentType.replace(/_/g, ' ')}</span>
                      <div className="mt-1">
                        <span className={`status ${doc.status === 'VERIFIED' ? 'verified' : doc.status === 'REJECTED' ? 'critical' : 'pending'}`}>
                          {doc.status}
                        </span>
                      </div>
                      {doc.bankStatement && (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs" data-testid={`statement-summary-${doc.id}`}>
                          <EvidenceAmount label="Opening" value={doc.bankStatement.openingBalance} />
                          <EvidenceAmount label="Closing" value={doc.bankStatement.closingBalance} />
                          <EvidenceAmount label="Deposits" value={doc.bankStatement.totalDeposits} />
                          <EvidenceAmount label="Withdrawals" value={doc.bankStatement.totalWithdrawals} />
                        </div>
                      )}
                      {doc.transactions?.map((transaction) => (
                        <div key={transaction.id} className="mt-3 rounded-md border border-[var(--line)] p-3 text-xs" data-testid={`statement-transaction-${transaction.id}`}>
                          <div className="flex items-center justify-between gap-3">
                            <strong>{transaction.description}</strong>
                            <span>{transaction.direction === 'withdrawal' ? '−' : '+'}${transaction.amount}</span>
                          </div>
                          <div className="mt-1 text-[var(--ink-soft)]">
                            {transaction.postedDate ?? 'Date unavailable'} · {transaction.sourcePage ? `page ${transaction.sourcePage}, ` : ''}line {transaction.sourceLine ?? 'unknown'} · {transaction.parserVersion}
                          </div>
                          <div className="mt-1 text-[var(--ink-soft)]">
                            Original: {JSON.stringify(transaction.originalValue)}
                          </div>
                          {transaction.correctionHistory.length > 0 && (
                            <div className="mt-1 text-[var(--ink-soft)]">
                              {transaction.correctionHistory.length} correction{transaction.correctionHistory.length === 1 ? '' : 's'} preserved
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EvidenceAmount({ label, value }: { label: string; value: string }) {
  return <div><span className="text-[var(--ink-soft)]">{label}</span><div className="font-medium">${value}</div></div>;
}

function QueueItemActions({
  item,
  handleDocReview,
  handleTxReview,
}: {
  item: ReviewQueueItem | undefined;
  handleDocReview: (id: string, decision: 'VERIFIED' | 'REJECTED', reason: string) => Promise<void>;
  handleTxReview: (id: string, action: 'APPROVE' | 'REJECT' | 'RECLASSIFY' | 'MARK_TRANSFER', reason: string, correctedValue?: Record<string, unknown>) => Promise<void>;
}) {
  if (!item) return <span className="document-pending-note">Specialized review required</span>;

  switch (item.type) {
    case 'financial_document':
      return <>
        <button className="btn btn-primary" onClick={() => handleDocReview(item.id, 'VERIFIED', 'Looks correct')}><Check size={14} /> Verify</button>
        <button className="btn" onClick={() => handleDocReview(item.id, 'REJECTED', 'Incorrect parsing')}><X size={14} /> Reject</button>
      </>;
    case 'bank_statement_transaction':
      return <>
        <button className="btn btn-primary" onClick={() => handleTxReview(item.id, 'APPROVE', 'Matches statement')}><Check size={14} /> Approve</button>
        <button className="btn" onClick={() => {
          const amount = window.prompt('Correct amount (for example, 12.34)');
          if (amount && /^\d+\.\d{2}$/.test(amount)) {
            void handleTxReview(item.id, 'RECLASSIFY', 'Reviewer corrected extracted amount', { amount });
          }
        }}>Correct amount</button>
        <button className="btn" onClick={() => handleTxReview(item.id, 'MARK_TRANSFER', 'Internal transfer')}><ArrowRightLeft size={14} /> Mark Transfer</button>
        <button className="btn" onClick={() => handleTxReview(item.id, 'REJECT', 'Fraud/Error')}><X size={14} /> Reject</button>
      </>;
    default: {
      const destination = queueItemDestination(item);
      return destination
        ? <Link href={destination.href} className="btn">{destination.label}</Link>
        : <span className="document-pending-note">Specialized review required</span>;
    }
  }
}