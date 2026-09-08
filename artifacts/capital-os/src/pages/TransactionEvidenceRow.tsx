import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetBankStatementTransactionInclusion,
  useDecideBankStatementTransactionCategory,
  usePreviewBankStatementTransactionMatch,
  useImportBankStatementTransaction,
  useLinkBankStatementTransaction,
  useUnlinkBankStatementTransaction,
  useReverseBankStatementTransactionImport,
  useReconcileBankStatementTransactionInclusion,
  useGetBudget,
  getGetBankStatementTransactionInclusionQueryKey,
  getGetVariableBudgetIntelligenceQueryKey,
  getGetBudgetQueryKey,
  getListTransactionReviewQueueQueryKey,
  getGetAccountingOverviewQueryKey,
  getGetCapitalGovernorV2QueryKey,
  useListFinancialDocuments,
  useListFinancialReviewQueue,
  type BankStatementTransactionEvidence,
  type StatementMatchCandidate
} from '@workspace/api-client-react';
import { Check, ArrowRightLeft, Search, Link as LinkIcon, RotateCcw, Plus, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function TransactionEvidenceRow({ transaction }: { transaction: BankStatementTransactionEvidence }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: inclusion, refetch: refetchInclusion } = useGetBankStatementTransactionInclusion(transaction.id, {
    query: {
      enabled: !!transaction.id,
      queryKey: getGetBankStatementTransactionInclusionQueryKey(transaction.id),
      retry: false,
    }
  });
  const { data: budget } = useGetBudget();

  const { refetch: refetchDocs } = useListFinancialDocuments();
  const { refetch: refetchQueue } = useListFinancialReviewQueue();

  const decideCategory = useDecideBankStatementTransactionCategory();
  const previewMatch = usePreviewBankStatementTransactionMatch();
  const [importKey, setImportKey] = useState(() => crypto.randomUUID());
  const [linkKey, setLinkKey] = useState(() => crypto.randomUUID());
  const [unlinkKey, setUnlinkKey] = useState(() => crypto.randomUUID());
  const [reverseKey, setReverseKey] = useState(() => crypto.randomUUID());
  const [reconcileKey, setReconcileKey] = useState(() => crypto.randomUUID());
  const importTx = useImportBankStatementTransaction({ request: { headers: { 'Idempotency-Key': importKey } } });
  const linkTx = useLinkBankStatementTransaction({ request: { headers: { 'Idempotency-Key': linkKey } } });
  const unlinkTx = useUnlinkBankStatementTransaction({ request: { headers: { 'Idempotency-Key': unlinkKey } } });
  const reverseTx = useReverseBankStatementTransactionImport({ request: { headers: { 'Idempotency-Key': reverseKey } } });
  const reconcileTx = useReconcileBankStatementTransactionInclusion({ request: { headers: { 'Idempotency-Key': reconcileKey } } });

  const [matchPreviewData, setMatchPreviewData] = useState<{outcome: string, candidates: StatementMatchCandidate[]} | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(transaction.selectedCategoryId ?? '');
  const [localDecision, setLocalDecision] = useState(transaction.categoryDecisionStatus ?? null);

  const invalidateEverything = () => {
    refetchInclusion();
    refetchDocs();
    refetchQueue();
    queryClient.invalidateQueries({ queryKey: getGetVariableBudgetIntelligenceQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBudgetQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionReviewQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAccountingOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCapitalGovernorV2QueryKey() });
  };

  const onDecideCategory = async (economicClassification: 'HOUSEHOLD' | 'BUSINESS' | 'TRANSFER' | 'SETTLEMENT_LINK' | 'UNKNOWN') => {
    try {
      if (economicClassification === 'HOUSEHOLD' && !selectedCategoryId) {
        toast({ title: 'Choose a Budget category first', variant: 'destructive' });
        return;
      }
      const status = economicClassification === 'HOUSEHOLD'
        ? (transaction.selectedCategoryId ? 'USER_CORRECTED' : 'USER_CONFIRMED')
        : economicClassification === 'TRANSFER'
          ? 'NOT_APPLICABLE_TRANSFER'
          : economicClassification === 'SETTLEMENT_LINK'
            ? 'NOT_APPLICABLE_SETTLEMENT'
            : 'REJECTED';
      await decideCategory.mutateAsync({
        transactionId: transaction.id,
        data: {
          status,
          economicClassification,
          categoryId: economicClassification === 'HOUSEHOLD' ? selectedCategoryId : null,
          reason: 'Reviewer confirmed category',
          idempotencyKey: crypto.randomUUID(),
        }
      });
      setLocalDecision(status);
      setMatchPreviewData(null);
      toast({ title: 'Category decided' });
      invalidateEverything();
    } catch (err: any) {
      toast({ title: 'Category decision failed', description: err.message, variant: 'destructive' });
    }
  };

  const onPreviewMatch = async () => {
    try {
      const res = await previewMatch.mutateAsync({ transactionId: transaction.id });
      setMatchPreviewData(res);
    } catch (err: any) {
      toast({ title: 'Match preview failed', description: err.message, variant: 'destructive' });
    }
  };

  const onImportNew = async () => {
    try {
      await importTx.mutateAsync({
        transactionId: transaction.id,
        data: {
          idempotencyKey: importKey,
          expectedMatchOutcome: 'NO_MATCH',
        }
      });
      setImportKey(crypto.randomUUID());
      toast({ title: 'Imported as new transaction' });
      invalidateEverything();
      setMatchPreviewData(null);
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    }
  };

  const onLink = async (financeTransactionId: string) => {
    try {
      await linkTx.mutateAsync({
        transactionId: transaction.id,
        data: {
          financeTransactionId,
          idempotencyKey: linkKey,
        }
      });
      setLinkKey(crypto.randomUUID());
      toast({ title: 'Linked to existing transaction' });
      invalidateEverything();
      setMatchPreviewData(null);
    } catch (err: any) {
      toast({ title: 'Link failed', description: err.message, variant: 'destructive' });
    }
  };

  const onReverse = async () => {
    try {
      await reverseTx.mutateAsync({
        transactionId: transaction.id,
        data: {
          reason: 'User requested reversal',
          idempotencyKey: reverseKey,
        }
      });
      setReverseKey(crypto.randomUUID());
      toast({ title: 'Import/Link reversed' });
      invalidateEverything();
    } catch (err: any) {
      toast({ title: 'Reversal failed', description: err.message, variant: 'destructive' });
    }
  };

  const onUnlink = async () => {
    try {
      await unlinkTx.mutateAsync({
        transactionId: transaction.id,
        data: { reason: 'Reviewer removed the evidence link', idempotencyKey: unlinkKey },
      });
      setUnlinkKey(crypto.randomUUID());
      toast({ title: 'Evidence link removed; the official transaction was unchanged' });
      invalidateEverything();
    } catch (err: any) {
      toast({ title: 'Unlink failed', description: err.message, variant: 'destructive' });
    }
  };

  const onReconcile = async () => {
    try {
      await reconcileTx.mutateAsync({
        transactionId: transaction.id,
        data: { reason: 'Reviewer acknowledged the source/official mismatch', idempotencyKey: reconcileKey },
      });
      setReconcileKey(crypto.randomUUID());
      toast({ title: 'Mismatch marked reviewed' });
      invalidateEverything();
    } catch (err: any) {
      toast({ title: 'Reconciliation failed', description: err.message, variant: 'destructive' });
    }
  };

  const evidenceApproved = ['APPROVE', 'RECLASSIFY'].includes(transaction.lastReviewAction ?? '');
  const householdDecision = ['USER_CONFIRMED', 'USER_CORRECTED'].includes(localDecision ?? '');
  const activeInclusion = inclusion && inclusion.status !== 'REVERSED' ? inclusion : undefined;
  const effectiveAmount = ((transaction.correctedValue as { amount?: string } | null)?.amount ?? transaction.amount);

  return (
    <div className="mt-3 rounded-md border border-[var(--line)] p-3 text-xs" data-testid={`statement-transaction-${transaction.id}`}>
      <div className="flex items-center justify-between gap-3">
        <strong>{transaction.description}</strong>
        <span>{transaction.direction === 'withdrawal' ? '−' : '+'}${String(effectiveAmount).replace('-', '')}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[var(--ink-soft)]">
        <div>
          {transaction.postedDate ?? 'Date unavailable'} · {transaction.sourcePage ? `page ${transaction.sourcePage}, ` : ''}line {transaction.sourceLine ?? 'unknown'} · {transaction.parserVersion}
        </div>
        <div className="flex items-center gap-2">
          <span className={`status ${['APPROVED', 'VERIFIED'].includes(transaction.reviewStatus) ? 'verified' : ['REJECTED', 'FAILED'].includes(transaction.reviewStatus) ? 'critical' : 'pending'}`}>
            Evidence: {transaction.reviewStatus}
          </span>
          {inclusion && (
            <span className={`status ${['IMPORTED_NEW', 'LINKED_EXISTING'].includes(inclusion.status) ? 'verified' : 'pending'}`}>
              Inclusion: {inclusion.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--line)] bg-[var(--paper)] -mx-3 -mb-3 p-3 rounded-b-md">
        {!evidenceApproved && !activeInclusion && (
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <AlertTriangle size={13} /> Approve or reclassify this evidence row before financial inclusion.
          </div>
        )}

        {evidenceApproved && !activeInclusion && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto]">
              <select
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
                className="input"
                aria-label={`Budget category for ${transaction.description}`}
                data-testid={`select-statement-category-${transaction.id}`}
              >
                <option value="">Choose Budget category</option>
                {(budget?.categories ?? []).filter((category) => category.categoryType !== 'transfer').map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <button
                className="btn btn-primary !h-9 !text-[11px]"
                onClick={() => onDecideCategory('HOUSEHOLD')}
                disabled={!selectedCategoryId || decideCategory.isPending}
                data-testid={`button-confirm-statement-category-${transaction.id}`}
              >
                <Check size={12}/> Confirm household category
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn !h-8 !text-[11px]" onClick={() => onDecideCategory('TRANSFER')} data-testid={`button-exclude-statement-transfer-${transaction.id}`}><ArrowRightLeft size={12}/> Transfer</button>
              <button className="btn !h-8 !text-[11px]" onClick={() => onDecideCategory('SETTLEMENT_LINK')} data-testid={`button-exclude-statement-settlement-${transaction.id}`}><LinkIcon size={12}/> Settlement-linked</button>
              <button className="btn !h-8 !text-[11px]" onClick={() => onDecideCategory('BUSINESS')}>Business</button>
              <button className="btn !h-8 !text-[11px]" onClick={() => onDecideCategory('UNKNOWN')}>Unknown / reject</button>
            </div>

            {householdDecision && (
              <div>
                <button
                  className="btn !h-8 !text-[11px]"
                  onClick={onPreviewMatch}
                  disabled={previewMatch.isPending}
                  data-testid={`button-preview-statement-match-${transaction.id}`}
                >
                  <Search size={12}/> Check official activity before import
                </button>
              </div>
            )}
            {localDecision && (
              <span className="status pending" data-testid={`text-statement-category-decision-${transaction.id}`}>
                Category: {localDecision.replace(/_/g, ' ')}
              </span>
            )}

            {matchPreviewData && (
              <div className="bg-white rounded border border-[var(--line)] p-3" data-testid={`statement-match-result-${transaction.id}`}>
                <div className="font-semibold mb-2 text-[11px] uppercase tracking-wider text-[var(--ink-soft)]">
                  Match outcome: {matchPreviewData.outcome.replace(/_/g, ' ')}
                </div>
                {matchPreviewData.outcome === 'NO_MATCH' && (
                  <div className="space-y-2">
                    <p>No official transaction matches household, account, date, signed amount, and source text.</p>
                    <p className="text-[var(--ink-soft)]">
                      Import will create exactly one approved official transaction for ${String(effectiveAmount).replace('-', '')} in the selected Budget category. It changes actuals, not the planned target.
                    </p>
                    <button
                      className="btn btn-primary !h-8 !text-[11px]"
                      onClick={onImportNew}
                      disabled={importTx.isPending}
                      data-testid={`button-import-statement-row-${transaction.id}`}
                    >
                      <Plus size={12}/> Confirm import as new
                    </button>
                  </div>
                )}
                {matchPreviewData.outcome === 'MULTIPLE_CANDIDATES' && (
                  <div className="flex items-start gap-2 text-[#9b6b18]">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Multiple plausible official transactions were found. Import and link are blocked until a reviewer resolves the duplicate.
                  </div>
                )}
                {matchPreviewData.outcome === 'ONE_HIGH_CONFIDENCE_MATCH' && matchPreviewData.candidates.map((candidate) => (
                  <div key={candidate.financeTransactionId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2 bg-[var(--paper-deep)] rounded">
                    <div>
                      <strong>{candidate.description}</strong>
                      <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">{String(candidate.transactionDate)} · ${candidate.amount}</div>
                      <div className="text-[10px] mt-0.5">{candidate.reasons.join(' · ')}</div>
                    </div>
                    <button className="btn !h-8 !text-[11px]" onClick={() => onLink(candidate.financeTransactionId)} disabled={linkTx.isPending} data-testid={`button-link-statement-row-${transaction.id}`}>
                      <LinkIcon size={12}/> Link evidence only
                    </button>
                  </div>
                ))}
                {['EXACT_ALREADY_LINKED', 'KNOWN_DUPLICATE'].includes(matchPreviewData.outcome) && (
                  <p>This evidence already has financial provenance. A second official transaction is blocked.</p>
                )}
              </div>
            )}
          </div>
        )}

        {activeInclusion && (
          <div className="flex flex-col gap-2">
            {activeInclusion.reviewRequired && (
              <div className="flex flex-col gap-2 rounded border border-[#e3c987] bg-[#fff8e9] p-2 sm:flex-row sm:items-center sm:justify-between">
                <span><AlertTriangle size={13} className="inline mr-1" /> Source and official activity differ; reconciliation is required.</span>
                <button className="btn !h-8 !text-[11px]" onClick={onReconcile} disabled={reconcileTx.isPending}>Mark reviewed</button>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[var(--ink-soft)]">
                {activeInclusion.status === 'IMPORTED_NEW'
                  ? 'One official transaction was created from this evidence.'
                  : 'This evidence is linked to an existing official transaction; no transaction was created.'}
              </span>
              {activeInclusion.status === 'IMPORTED_NEW' ? (
                <button className="btn !h-8 !text-[11px] !border-red-200 !text-red-700" onClick={onReverse} disabled={reverseTx.isPending} data-testid={`button-reverse-statement-import-${transaction.id}`}>
                  <RotateCcw size={12}/> Reverse import
                </button>
              ) : (
                <button className="btn !h-8 !text-[11px]" onClick={onUnlink} disabled={unlinkTx.isPending} data-testid={`button-unlink-statement-row-${transaction.id}`}>
                  <RotateCcw size={12}/> Unlink evidence
                </button>
              )}
            </div>
          </div>
        )}

        {inclusion?.status === 'REVERSED' && (
          <div className="text-[var(--ink-soft)]">Financial inclusion was reversed. Source evidence and audit history are preserved.</div>
        )}
      </div>
    </div>
  );
}
