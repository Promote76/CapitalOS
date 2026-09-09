import { FormEvent, useState, ReactNode, useEffect } from "react";
import { ArrowUpRight, CheckCircle2, ChevronLeft, LockKeyhole, AlertTriangle, ShieldCheck, RefreshCw, Unplug, Database, ShieldAlert, Check } from "lucide-react";
import { 
  useGetSchwabIntegrationStatus, 
  useInitiateSchwabConnect, 
  useRefreshSchwabConnection, 
  useSyncSchwabObservations, 
  useDisconnectSchwabConnection,
  getGetSchwabIntegrationStatusQueryKey,
  useGetSchwabMarketDataStatus,
  useInitiateSchwabMarketDataConnect,
  useRefreshSchwabMarketDataConnection,
  useDisconnectSchwabMarketDataConnection,
  getGetSchwabMarketDataStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: ReactNode; description?: string; actions?: ReactNode }) {
  return <div className="page-heading animate-in">
    <div><div className="eyebrow">{eyebrow}</div><h1 data-testid="text-page-title">{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>;
}

function CardTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="card-title-row"><div><div className="card-title">{title}</div>{subtitle && <div className="card-subtitle">{subtitle}</div>}</div>{action}</div>;
}

function displayDate(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SchwabIntegrationPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useGetSchwabIntegrationStatus();
  
  const connect = useInitiateSchwabConnect();
  const refresh = useRefreshSchwabConnection();
  const sync = useSyncSchwabObservations();
  const disconnect = useDisconnectSchwabConnection();
  const { data: marketDataStatus, isLoading: isMarketDataLoading } = useGetSchwabMarketDataStatus();
  const marketDataConnect = useInitiateSchwabMarketDataConnect();
  const marketDataRefresh = useRefreshSchwabMarketDataConnection();
  const marketDataDisconnect = useDisconnectSchwabMarketDataConnection();

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    const marketDataOauthStatus = params.get('market_data_oauth');
    if (oauthStatus) {
      if (oauthStatus === 'connected') {
        onFeedback('Schwab integration authorized successfully.');
      } else if (oauthStatus === 'failed') {
        onFeedback('Schwab authorization failed. Please try again.');
      } else if (oauthStatus === 'configuration_required') {
        onFeedback('Schwab developer configuration is required.');
      }
      
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth');
      window.history.replaceState({}, document.title, url.toString());
    }
    if (marketDataOauthStatus) {
      onFeedback(marketDataOauthStatus === 'connected'
        ? 'Schwab Market Data Production authorized successfully.'
        : marketDataOauthStatus === 'configuration_required'
          ? 'Schwab Market Data Production configuration is required.'
          : 'Schwab Market Data Production authorization failed.');
      const url = new URL(window.location.href);
      url.searchParams.delete('market_data_oauth');
      window.history.replaceState({}, document.title, url.toString());
    }
  }, [onFeedback]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetSchwabIntegrationStatusQueryKey() });
  const invalidateMarketData = () => queryClient.invalidateQueries({ queryKey: getGetSchwabMarketDataStatusQueryKey() });

  const handleConnect = async () => {
    try {
      const res = await connect.mutateAsync();
      if (res?.authorizationUrl) {
        window.location.assign(res.authorizationUrl);
      } else {
        onFeedback("Configuration initiated, but no authorization URL returned.");
        invalidate();
      }
    } catch (e: any) {
      onFeedback(e.message || "Failed to initiate connection.");
    }
  };

  const handleRefresh = async () => {
    try {
      await refresh.mutateAsync();
      invalidate();
      onFeedback("Access token refreshed.");
    } catch (e: any) {
      onFeedback(e.message || "Failed to refresh token.");
    }
  };

  const handleSync = async () => {
    try {
      await sync.mutateAsync();
      invalidate();
      onFeedback("Observation sync successful.");
    } catch (e: any) {
      onFeedback(e.message || "Failed to sync observations.");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      invalidate();
      setIsDisconnecting(false);
      onFeedback("Schwab connection removed.");
    } catch (e: any) {
      onFeedback(e.message || "Failed to disconnect.");
    }
  };

  const handleMarketDataConnect = async () => {
    try {
      const result = await marketDataConnect.mutateAsync();
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Failed to initiate Market Data authorization.");
    }
  };

  const handleMarketDataRefresh = async () => {
    try {
      await marketDataRefresh.mutateAsync();
      invalidateMarketData();
      onFeedback("Market Data access token refreshed.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Failed to refresh Market Data token.");
    }
  };

  const handleMarketDataDisconnect = async () => {
    try {
      await marketDataDisconnect.mutateAsync();
      invalidateMarketData();
      onFeedback("Market Data Production connection removed.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Failed to disconnect Market Data Production.");
    }
  };

  if (isLoading) {
    return <main className="content"><div className="auth-loading">Loading configuration...</div></main>;
  }

  const isConnected = status?.connectionStatus === 'LIVE_CONNECTED';
  const hasError = status?.connectionStatus === 'ERROR';

  return (
    <main className="content">
      <div style={{ marginBottom: 20 }}>
        <Link href="/settings" className="btn btn-secondary" style={{ display: 'inline-flex', padding: '4px 10px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Back to settings
        </Link>
      </div>
      
      <PageHeading 
        eyebrow="Integrations / Charles Schwab" 
        title={<>Charles Schwab<br /><em>observation connection.</em></>} 
        description="Capital OS connects to Charles Schwab in read-only observation mode to track account balances and holdings without manual entry."
      />

      <div className="vehicle-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          <section className="card card-pad animate-in delay-1">
            <CardTitle title="Read-only connection — trading disabled." subtitle="Fail-closed data mode and permissions" />
            <div className="business-setup-disclaimer" style={{ background: '#f8fbf8', borderColor: '#b7c9bd', color: '#18322e', marginTop: 0 }}>
              <ShieldCheck size={16} style={{ color: '#2e594f' }} />
              <div>
                <strong>Safe to connect</strong>
                <span style={{ display: 'block', marginTop: 4 }}>This integration has a capability of <code>OBSERVATION_ONLY</code>. Data mode is currently <code>{status?.dataMode === 'LIVE_CONNECTED' && status?.tokenHealth === 'HEALTHY' ? 'LIVE_CONNECTED' : 'DISCONNECTED (fail-closed)'}</code>. Capital OS is explicitly prohibited from submitting orders, sending cancels or replaces, executing transfers or withdrawals, modifying risk limits, running strategy execution, or arming Micro-Live functions on this connection.</span>
              </div>
            </div>

            <div className="business-setup-list" style={{ marginTop: 24 }}>
              <div className="business-setup-row">
                <ShieldAlert size={14} style={{ color: '#2e594f' }} />
                <div>
                  <strong>Accounts and Trading Production</strong>
                  <span>Required product. Used only for read-only observation.</span>
                </div>
                <div />
                <span className="badge" style={{ background: '#edf4ee', color: '#2e594f' }}>Required</span>
              </div>
              <div className="business-setup-row">
                <Database size={14} style={{ color: '#2e594f' }} />
                <div>
                  <strong>Market Data Production</strong>
                  <span>Required product for asset pricing.</span>
                </div>
                <div />
                <span className="badge" style={{ background: '#edf4ee', color: '#2e594f' }}>Required</span>
              </div>
            </div>
          </section>

          <section className="card card-pad animate-in delay-2">
            <CardTitle title="Connection status" subtitle="Current authentication and data health" />
            
            <div className="grid-2" style={{ marginBottom: 24 }}>
              <div className="forecast-row" style={{ padding: 12 }}>
                <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--app-font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Connection</span>
                <strong style={{ display: 'block', fontSize: 14 }}>
                  {status?.connectionStatus === 'LIVE_CONNECTED' && <span style={{ color: '#2e594f', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> Live</span>}
                  {status?.connectionStatus === 'DISCONNECTED' && <span style={{ color: 'var(--ink-soft)' }}>Disconnected</span>}
                  {status?.connectionStatus === 'CONFIGURATION_REQUIRED' && <span style={{ color: '#9b6b18', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> Configuration required</span>}
                  {status?.connectionStatus === 'ERROR' && <span style={{ color: '#a43a2e', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> Error</span>}
                </strong>
              </div>
              <div className="forecast-row" style={{ padding: 12 }}>
                <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--app-font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Authorization</span>
                <strong style={{ display: 'block', fontSize: 14 }}>
                  {status?.accountAuthorizationStatus === 'AUTHORIZED' ? 'Authorized' : 'Not authorized'}
                </strong>
              </div>
              <div className="forecast-row" style={{ padding: 12 }}>
                <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--app-font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Token health</span>
                <strong style={{ display: 'block', fontSize: 14 }}>
                  {status?.tokenHealth === 'HEALTHY' && <span style={{ color: '#2e594f' }}>Healthy</span>}
                  {status?.tokenHealth === 'EXPIRED' && <span style={{ color: '#a43a2e' }}>Expired</span>}
                  {status?.tokenHealth === 'UNAVAILABLE' && <span style={{ color: 'var(--ink-soft)' }}>Unavailable</span>}
                </strong>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{displayDate(status?.tokenExpiresAt, 'No expiry known')}</span>
              </div>
              <div className="forecast-row" style={{ padding: 12 }}>
                <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--app-font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Last sync</span>
                <strong style={{ display: 'block', fontSize: 14 }}>
                  {displayDate(status?.lastSuccessfulSyncAt, 'Never')}
                </strong>
              </div>
            </div>

            <div className="heading-actions" style={{ justifyContent: 'flex-start' }}>
              {status?.credentialsConfigured ? (
                <>
                  {!isConnected ? (
                    <button className="btn btn-primary" onClick={handleConnect} disabled={connect.isPending}>
                      {connect.isPending ? 'Connecting...' : (hasError ? 'Reconnect' : 'Connect accounts')}
                    </button>
                  ) : (
                    <button className="btn" onClick={handleConnect} disabled={connect.isPending}>
                      {connect.isPending ? 'Connecting...' : 'Reconnect'}
                    </button>
                  )}
                  
                  {isConnected && (
                    <>
                      <button className="btn" onClick={handleRefresh} disabled={refresh.isPending}>
                        <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : ''} /> Refresh token
                      </button>
                      <button className="btn" onClick={handleSync} disabled={sync.isPending}>
                        <Database size={14} /> Sync now
                      </button>
                    </>
                  )}

                  {!isDisconnecting ? (
                    <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setIsDisconnecting(true)} disabled={disconnect.isPending}>
                      <Unplug size={14} /> Disconnect
                    </button>
                  ) : (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#a43a2e' }}>Are you sure?</span>
                      <button className="btn" onClick={() => setIsDisconnecting(false)}>Cancel</button>
                      <button className="btn" style={{ background: '#fbebe9', color: '#a43a2e', borderColor: '#e4c2be' }} onClick={handleDisconnect} disabled={disconnect.isPending}>
                        Yes, disconnect
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: '#9b6b18', fontSize: 13, background: '#fff8e9', padding: '8px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} /> Configure App Key and Secret to connect.
                </div>
              )}
            </div>
          </section>

          <section className="card card-pad animate-in delay-3">
            <CardTitle title="Market Data Production app" subtitle="Separate credentials, OAuth state, and tokens; shared registered callback" />
            {isMarketDataLoading ? (
              <div className="auth-loading">Loading Market Data configuration...</div>
            ) : (
              <>
                <div className="grid-2" style={{ marginBottom: 20 }}>
                  <div className="forecast-row" style={{ padding: 12 }}>
                    <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--app-font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Connection</span>
                    <strong>{marketDataStatus?.connectionStatus === 'LIVE_CONNECTED' ? 'Live' : marketDataStatus?.connectionStatus === 'CONFIGURATION_REQUIRED' ? 'Configuration required' : marketDataStatus?.connectionStatus === 'ERROR' ? 'Error' : 'Disconnected'}</strong>
                  </div>
                  <div className="forecast-row" style={{ padding: 12 }}>
                    <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--app-font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Last market read</span>
                    <strong>{displayDate(marketDataStatus?.lastSuccessfulReadAt, 'Never')}</strong>
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 20 }}>
                  <label>Market Data app callback URL</label>
                  <input
                    readOnly
                    value={marketDataStatus?.callbackUrl || 'Will generate when the Market Data app is configured.'}
                    style={{ fontFamily: 'var(--app-font-mono)', fontSize: 11, background: '#f8fbf8' }}
                    onClick={(event) => {
                      event.currentTarget.select();
                      if (marketDataStatus?.callbackUrl) navigator.clipboard.writeText(marketDataStatus.callbackUrl).catch(() => {});
                    }}
                  />
                </div>
                <div className="heading-actions" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn btn-primary" onClick={handleMarketDataConnect} disabled={!marketDataStatus?.credentialsConfigured || marketDataConnect.isPending}>
                    {marketDataConnect.isPending ? 'Connecting...' : marketDataStatus?.connectionStatus === 'LIVE_CONNECTED' ? 'Reconnect Market Data' : 'Connect Market Data'}
                  </button>
                  {marketDataStatus?.connectionStatus === 'LIVE_CONNECTED' && (
                    <>
                      <button className="btn" onClick={handleMarketDataRefresh} disabled={marketDataRefresh.isPending}><RefreshCw size={14} /> Refresh token</button>
                      <button className="btn btn-secondary" onClick={handleMarketDataDisconnect} disabled={marketDataDisconnect.isPending}><Unplug size={14} /> Disconnect Market Data</button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section className="card card-pad animate-in delay-3">
            <CardTitle title="Configuration instructions" subtitle="For developer portal" />
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
              Register an app in the Charles Schwab Developer Portal using the required products listed on the left.
            </p>
            
            <div className="field" style={{ marginBottom: 20 }}>
              <label>Callback URL</label>
              <div style={{ position: 'relative' }}>
                <input 
                  readOnly 
                  value={status?.callbackUrl || 'Will generate when required environment variables are set.'} 
                  style={{ fontFamily: 'var(--app-font-mono)', fontSize: 11, background: '#f8fbf8', color: status?.callbackUrl ? 'var(--ink)' : 'var(--ink-soft)' }} 
                  onClick={(e) => {
                    const target = e.target as HTMLInputElement;
                    target.select();
                    if (status?.callbackUrl) {
                      navigator.clipboard.writeText(status.callbackUrl).catch(() => {});
                    }
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, display: 'block' }}>Copy this exactly into your Schwab App settings.</span>
            </div>

            <div className="document-boundary" style={{ marginBottom: 0 }}>
              <LockKeyhole size={16} />
              <div>
                <strong>Server-side credentials required</strong>
                <span>
                  Never add browser fields that submit or expose application secrets.
                  Set your Schwab App Key / Client ID and Schwab App Secret as secure environment variables 
                  named <code>SCHWAB_APP_KEY</code> and <code>SCHWAB_APP_SECRET</code> for the portfolio app.
                  The separate Market Data app uses <code>SCHWAB_MARKET_DATA_APP_KEY</code> and <code>SCHWAB_MARKET_DATA_APP_SECRET</code>.
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
