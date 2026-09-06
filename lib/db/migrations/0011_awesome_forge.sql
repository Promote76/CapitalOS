ALTER TABLE "budget_planning_category_snapshots" ADD COLUMN "allocation_basis_points" integer;
UPDATE "budget_planning_category_snapshots"
SET "allocation_basis_points" = CASE "name"
  WHEN 'Housing' THEN 3000
  WHEN 'Food' THEN 1200
  WHEN 'Transportation' THEN 1000
  WHEN 'Utilities' THEN 800
  WHEN 'Insurance' THEN 600
  WHEN 'Healthcare' THEN 500
  WHEN 'Childcare' THEN 500
  WHEN 'Debt payment' THEN 800
  WHEN 'Personal' THEN 400
  WHEN 'Entertainment' THEN 300
  WHEN 'Savings' THEN 500
  WHEN 'Investments' THEN 300
  WHEN 'Other' THEN 100
  ELSE NULL
END
WHERE "category_type" NOT IN ('income', 'transfer')
  AND EXISTS (
    SELECT 1
    FROM "budget_planning_periods"
    WHERE "budget_planning_periods"."id" = "budget_planning_category_snapshots"."period_id"
      AND "budget_planning_periods"."status" = 'draft'
  );