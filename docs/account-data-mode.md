# Account Data Mode

Account data mode is derived from provider connection metadata:
`MANUAL`, `STATEMENT_SUPPORTED`, `LIVE_CONNECTED`, or `SIMULATED_TEST_ONLY`.
Institution and nickname text are never used. A live mode requires a non-manual
provider, granted consent, a stored unrevoked credential, and healthy/connected
provider state. Wells Fargo is therefore manual or statement-supported unless
real provider metadata meets those conditions.
