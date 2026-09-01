# Capital OS risk model

Capital OS uses a conservative, explainable control model rather than market prediction.

| Control | Default | Effect |
| --- | ---: | --- |
| Protected capital lock | On | Duplex Reserve cannot fund experimental strategy capital |
| Maximum active capital | `$5,000.00` | Caps active strategy-capable capital |
| Maximum strategy allocation | `$500.00` | Caps any future strategy allocation |
| Maximum weekly risk | `1%` | Leaves room for household review before risk expands |
| Maximum drawdown | `5%` | A review threshold for future strategy evidence |
| Minimum cash reserve | `$3,000.00` | Keeps a household liquidity floor visible |
| Emergency stop | Ready | Owner can lock new movement pending review |

These values are stored per household in `risk_states`, evaluated server-side, and surfaced as status information to the UI. They are not trading instructions and do not create a brokerage connection.