# Money Unit Contract

Domain money parsers use exact integer cents (`parseMoneyToCents`) and format at
the boundary (`centsToMoney`). Database decimal values are strings with scale 2.
No financial ingestion path may infer an implicit ×100 or ÷100 conversion.
