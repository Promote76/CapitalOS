import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import {
  useGetBudgetPlanningPeriod,
  useGetVariableBudgetIntelligence,
  useCreateVehicleScenario,
  useGetCapitalGovernorV2,
  useGetHousehold,
} from '@workspace/api-client-react';
import { 
  BarChart3, 
  Info, 
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Building2,
  AlertTriangle,
  Car,
  TrendingUp,
  Wallet,
  CalendarDays,
  Target,
  FileText
} from 'lucide-react';

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

const Progress = ({ value, className = '' }: { value: number; className?: string }) => (
  <div className={`progress-track ${className}`}>
    <div className="progress-fill" style={{ width: `${Math.min(value, 100)}%` }} />
  </div>
);

function displayMoney(value: string | number | undefined | null, fallback: string) {
  if (value === undefined || value === null || value === 'NOT_CALCULATED') return fallback;
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g,"")) : value;
  return Number.isFinite(num) ? `$${Math.round(num).toLocaleString('en-US')}` : fallback;
}

function formatPeriod(period: any) {
  if (!period) return 'Unknown';
  if (typeof period === 'string') return period;
  if (period.start && period.end) return `${period.start} to ${period.end}`;
  if (period.start) return `From ${period.start}`;
  if (period.end) return `Until ${period.end}`;
  return 'Unknown';
}

function SectionEvidence() {
  const { data: intelligence } = useGetVariableBudgetIntelligence({
    asOf: new Date().toISOString().split('T')[0],
  });

  const ev = intelligence?.documentEvidence;

  return (
    <div className="card card-pad page-section animate-in delay-1" data-testid="card-evidence">
      <div className="card-title-row">
        <div>
          <div className="card-title">Verifiable Evidence</div>
          <div className="card-subtitle">Source data for variable intelligence.</div>
        </div>
        {ev && (
          <span className={`status ${ev.readinessStatus === 'REVIEWED_EVIDENCE_AVAILABLE' ? 'verified' : ev.readinessStatus === 'NO_UPLOADED_EVIDENCE' ? 'critical' : 'pending'}`}>
            {ev.readinessStatus.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {!ev ? (
        <div className="empty-state">
           <div className="empty-icon"><FileText size={20} /></div>
           <div className="empty-title">Awaiting Source Data</div>
           <p>Upload bank statements to build verifiable intelligence.</p>
           <Link href="/documents" className="btn btn-primary mt-3"><FileText size={14} /> Go to Documents</Link>
        </div>
      ) : (
        <div className="evidence-summary">
          <div className="grid grid-cols-2 gap-4 text-sm mb-4 border-b border-[var(--line)] pb-4 mt-2">
            <div>
              <span className="mono-label block mb-1">Documents</span>
              <div className="flex items-center justify-between">
                <span>{ev.reviewedDocumentCount ?? 0} reviewed / {ev.pendingDocumentCount ?? 0} pending</span>
                {(ev.pendingDocumentCount ?? 0) > 0 && <Link href="/documents" className="text-xs font-semibold text-[var(--ink)] hover:underline">Review &rarr;</Link>}
              </div>
            </div>
            <div>
              <span className="mono-label block mb-1">Rows</span>
              <div className="flex items-center justify-between">
                <span>{ev.reviewedRowCount ?? 0} reviewed / {ev.pendingRowCount ?? 0} pending</span>
                {(ev.pendingRowCount ?? 0) > 0 && <Link href="/documents" className="text-xs font-semibold text-[var(--ink)] hover:underline">Review &rarr;</Link>}
              </div>
            </div>
            <div>
              <span className="mono-label block mb-1">Latest Statement</span>
              <div>{formatPeriod(ev.latestStatementPeriod)} <span className="text-[var(--ink-soft)] text-xs">({ev.latestStatementDate || 'Unknown'})</span></div>
            </div>
            <div>
              <span className="mono-label block mb-1">Cash Flow from Reviewed</span>
              <div>Deposits: <strong className="text-[var(--ink)]">{displayMoney(ev.reviewedDeposits, '$0')}</strong></div>
              <div>Withdrawals: <strong className="text-[var(--ink)]">{displayMoney(ev.reviewedWithdrawals, '$0')}</strong></div>
            </div>
          </div>

          <div className="text-xs text-[var(--ink-soft)] mb-4 flex flex-wrap gap-x-4 gap-y-1">
            <span>Exclusions: <strong>{ev.excludedTransferCount ?? 0} transfers</strong>, <strong>{ev.linkedSettlementDepositCount ?? 0} settlements</strong></span>
            {ev.explanation && <span>&middot; {ev.explanation}</span>}
          </div>

          <div className="bg-[#fff8e9] border border-[#e3ded1] rounded-md p-3 text-xs text-[#9b6b18] flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div>
              <strong>Advisory only:</strong> This reviewed evidence supports planning review and readiness checks, but <em>does not change forecast math or official household totals.</em>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionForecast() {
  const { data: household } = useGetHousehold();
  const { data: intelligence } = useGetVariableBudgetIntelligence({
    asOf: new Date().toISOString().split('T')[0],
  });

  const forecasts = intelligence?.forecast || [];

  return (
    <div className="card card-pad page-section animate-in delay-1" data-testid="card-forecast">
      <CardTitle title="Cash Flow Forecast" subtitle="Projected household cash over the next 90 days." />
      {forecasts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><TrendingUp size={20} /></div>
          <div className="empty-title">Insufficient Data</div>
          <p>Variable income intelligence requires more verified history.</p>
        </div>
      ) : (
        <div className="forecast-grid">
          {forecasts.map((f: any, i: number) => (
            <div key={`${f.scenario}-${f.days}`} className="forecast-row">
              <div className="forecast-header">
                <strong>{f.days} Day {f.scenario}</strong>
                <span className={`status ${f.status === 'HEALTHY' ? 'verified' : f.status === 'TIGHT' ? 'pending' : 'critical'}`}>
                  {f.status}
                </span>
              </div>
              <div className="forecast-metrics">
                <div><span>Opening</span> <strong>{displayMoney(f.openingCash, '-')}</strong></div>
                <div><span>Income</span> <strong>{displayMoney(f.income, '-')}</strong></div>
                <div><span>Outflows</span> <strong>{displayMoney(f.mandatoryOutflows, '-')}</strong></div>
                <div><span>Ending</span> <strong>{displayMoney(f.endingCash, '-')}</strong></div>
              </div>
              <div className="forecast-pressure">
                <span className="mono-label">Pressure: {f.pressure}</span>
                <Progress value={f.pressure === 'LOW' ? 25 : f.pressure === 'MODERATE' ? 50 : f.pressure === 'HIGH' ? 75 : 100} className={f.pressure === 'CRITICAL' ? 'critical-track' : ''} />
              </div>
              <p className="forecast-explanation">{f.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionSafeToDeploy() {
  const [expanded, setExpanded] = useState(false);
  const { data: governor } = useGetCapitalGovernorV2({
    asOf: new Date().toISOString().split('T')[0],
  });

  return (
    <div className="card card-pad page-section animate-in delay-2" data-testid="card-safe-to-deploy">
      <div className="card-title-row">
        <div>
          <div className="card-title">Safe-to-Deploy Capital</div>
          <div className="card-subtitle">Conservative, disjoint household liquidity ready for allocation.</div>
        </div>
        {governor && (
          <span className={`status ${governor.status === 'READY' ? 'verified' : governor.status === 'CONSERVATIVE' ? 'pending' : 'critical'}`}>
            {governor.status}
          </span>
        )}
      </div>

      {!governor ? (
        <div className="empty-state">
          <div className="empty-icon"><ShieldAlert size={20} /></div>
          <div className="empty-title">Not Calculated</div>
          <p>Capital Governor is waiting for required data.</p>
        </div>
      ) : (
        <>
          <div className="governor-hero">
            <div className="governor-amount">
              {displayMoney(governor.safeToDeploy, 'NOT CALCULATED')}
              <span>Deployable Limit</span>
            </div>
            {governor.reasons.length > 0 && (
              <div className="governor-reasons">
                {governor.reasons.map((r, i) => <div key={i}><AlertTriangle size={14} /> {r}</div>)}
              </div>
            )}
            <p className="governor-no-movement">
              <Info size={14} /> Review the recommended waterfall allocations; no money movement is authorized.
            </p>
          </div>

          <button className="btn btn-secondary w-full" onClick={() => setExpanded(!expanded)} style={{ marginTop: 15 }}>
            {expanded ? 'Hide full calculation' : 'Show full calculation'}
          </button>

          {expanded && (
            <div className="governor-calculation mt-4">
              <div className="mono-label mb-2">Calculation Components</div>
              <div className="components-list">
                {governor.components.map((comp: any) => (
                  <div key={comp.key} className="component-row">
                    <div className="comp-info">
                      <strong>{comp.label}</strong>
                      <div className="comp-provenance">
                        {(comp.sourceReferences || []).map((ref: any) => ref.reference).join(', ')}
                      </div>
                    </div>
                    <div className="comp-amount">
                      <span className={comp.sign === 'subtract' ? 'negative' : 'positive'}>
                        {comp.sign === 'subtract' ? '-' : '+'}
                      </span>
                      {displayMoney(comp.amount, 'NOT CALCULATED')}
                    </div>
                  </div>
                ))}
              </div>
              <div className="governor-meta mt-4 pt-4 border-t border-[var(--line)]">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <strong className="block text-[var(--ink)]">Double Subtraction</strong>
                    <span className="text-[var(--ink-soft)]">
                      Detected: {governor.calculation.doubleSubtraction.detected ? 'Yes' : 'No'}
                      <br/>
                      Disjoint: {governor.calculation.doubleSubtraction.obligationsAreDisjoint ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <strong className="block text-[var(--ink)]">Data Readiness</strong>
                    <span className="text-[var(--ink-soft)]">
                      {governor.dataReadiness.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


function SectionVehicleAffordability() {
  const [formData, setFormData] = useState({
    vehiclePrice: '',
    downPayment: '',
    loanAmount: '',
    estimatedApr: '',
    loanTermMonths: '60',
    monthlyPayment: '',
    insurance: '',
    fuel: '',
    maintenanceReserve: '',
    registrationReserve: '',
    parkingTolls: '',
    otherMonthlyCost: '',
  });

  const createScenario = useCreateVehicleScenario();
  const [scenario, setScenario] = useState<any>(null);

  const calculate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: "New Vehicle Scenario",
      vehiclePrice: formData.vehiclePrice || "0",
      downPayment: formData.downPayment || "0",
      loanAmount: formData.loanAmount || "0",
      estimatedApr: formData.estimatedApr || "0",
      loanTermMonths: formData.loanTermMonths ? parseInt(formData.loanTermMonths, 10) : 60,
      monthlyPayment: formData.monthlyPayment || "0",
      insurance: formData.insurance || "0",
      fuel: formData.fuel || "0",
      maintenanceReserve: formData.maintenanceReserve || "0",
      registrationReserve: formData.registrationReserve || "0",
      parkingTolls: formData.parkingTolls || "0",
      otherMonthlyCost: formData.otherMonthlyCost || "0",
    };
    
    // Use the real mutation
    const result = await createScenario.mutateAsync({ data });
    setScenario(result);
  };

  return (
    <div className="card card-pad page-section animate-in delay-3" data-testid="card-vehicle">
      <CardTitle title="Vehicle Affordability" subtitle="Model operating costs and capital impact without creating liability." />
      
      <div className="vehicle-layout">
        <form onSubmit={calculate} className="vehicle-form">
          <div className="form-group-title">Acquisition</div>
          <div className="grid-2">
            <label>Price <input type="number" value={formData.vehiclePrice} onChange={e => setFormData({...formData, vehiclePrice: e.target.value})} placeholder="35000" /></label>
            <label>Down Payment <input type="number" value={formData.downPayment} onChange={e => setFormData({...formData, downPayment: e.target.value})} placeholder="5000" /></label>
            <label>Loan Amount <input type="number" value={formData.loanAmount} onChange={e => setFormData({...formData, loanAmount: e.target.value})} placeholder="30000" /></label>
            <label>APR (%) <input type="number" step="0.1" value={formData.estimatedApr} onChange={e => setFormData({...formData, estimatedApr: e.target.value})} placeholder="6.5" /></label>
            <label>Term (Months) <input type="number" value={formData.loanTermMonths} onChange={e => setFormData({...formData, loanTermMonths: e.target.value})} /></label>
            <label>Monthly Payment <input type="number" value={formData.monthlyPayment} onChange={e => setFormData({...formData, monthlyPayment: e.target.value})} placeholder="Override derived" /></label>
          </div>

          <div className="form-group-title mt-4">Operating Costs (Monthly)</div>
          <div className="grid-3">
            <label>Insurance <input type="number" value={formData.insurance} onChange={e => setFormData({...formData, insurance: e.target.value})} /></label>
            <label>Fuel <input type="number" value={formData.fuel} onChange={e => setFormData({...formData, fuel: e.target.value})} /></label>
            <label>Maintenance <input type="number" value={formData.maintenanceReserve} onChange={e => setFormData({...formData, maintenanceReserve: e.target.value})} /></label>
            <label>Registration <input type="number" value={formData.registrationReserve} onChange={e => setFormData({...formData, registrationReserve: e.target.value})} /></label>
            <label>Parking <input type="number" value={formData.parkingTolls} onChange={e => setFormData({...formData, parkingTolls: e.target.value})} /></label>
            <label>Other <input type="number" value={formData.otherMonthlyCost} onChange={e => setFormData({...formData, otherMonthlyCost: e.target.value})} /></label>
          </div>

          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={createScenario.isPending}>
            {createScenario.isPending ? 'Calculating...' : 'Run Scenario'}
          </button>
        </form>

        {scenario && (
          <div className="vehicle-results">
            <div className={`status-banner ${scenario.status === 'HOUSEHOLD_SHORTFALL_RISK' ? 'critical' : scenario.status === 'INSUFFICIENT_DATA' ? 'pending' : 'verified'}`}>
              <strong>{scenario.status.replace(/_/g, ' ')}</strong>
            </div>

            <div className="result-grid mt-4">
              <div>
                <span className="mono-label">Monthly Cost</span>
                <strong className="text-xl block">{displayMoney(scenario.totalMonthlyCost, '-')}</strong>
              </div>
              <div>
                <span className="mono-label">New Op Budget</span>
                <strong className="text-xl block">{displayMoney(scenario.newOperatingBudget, '-')}</strong>
              </div>
              <div>
                <span className="mono-label">Floor Surplus</span>
                <strong className="text-xl block">{displayMoney(scenario.newFloorSurplus, '-')}</strong>
              </div>
            </div>

            <div className="impacts mt-6">
              <div className="mono-label mb-2">Impact Analysis</div>
              <div className="impact-row">
                <span>Capital Surplus Impact</span>
                <strong>{displayMoney(scenario.capitalSurplusImpact, '-')}</strong>
              </div>
              <div className="impact-row">
                <span>Cash Buffer Impact</span>
                <strong>{displayMoney(scenario.cashBufferImpact, '-')}</strong>
              </div>
              <div className="impact-row">
                <span>Emergency Reserve Impact</span>
                <strong>{displayMoney(scenario.emergencyReserveImpact, '-')}</strong>
              </div>
              <div className="impact-row">
                <span>Duplex Contribution Impact</span>
                <strong>{displayMoney(scenario.duplexContributionImpact, '-')}</strong>
              </div>
            </div>

            <div className="horizon mt-6">
              <div className="mono-label mb-2">Horizon Cost</div>
              <div className="flex gap-4">
                <div><span className="text-xs text-[var(--ink-soft)] block">30 Days</span> <strong>{displayMoney(scenario.horizonImpact?.days30, '-')}</strong></div>
                <div><span className="text-xs text-[var(--ink-soft)] block">60 Days</span> <strong>{displayMoney(scenario.horizonImpact?.days60, '-')}</strong></div>
                <div><span className="text-xs text-[var(--ink-soft)] block">90 Days</span> <strong>{displayMoney(scenario.horizonImpact?.days90, '-')}</strong></div>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-soft)] mt-4">
              <Info size={12} className="inline mr-1" /> Planning only. No liability created.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


export default function BudgetPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <>
      {!embedded && <PageHeading 
        eyebrow="Financial Control" 
        title="Budget & Planning" 
        description="Forecasts, capacity, and scenario modeling based on verified data." 
      />}
      
      <div className="dashboard-grid">
        <div className="grid gap-[18px]">
          <SectionEvidence />
          <SectionForecast />
          <SectionVehicleAffordability />
        </div>
        <div className="grid gap-[18px] content-start">
          <SectionSafeToDeploy />
        </div>
      </div>
    </>
  );
}
