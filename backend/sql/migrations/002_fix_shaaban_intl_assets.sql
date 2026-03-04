-- Fix: Shaaban Karim double-counted ₹60L unlisted ESOPs as international assets.
-- Remove intlAssets and recalculate affected metrics.

UPDATE financial_profiles
SET
  responses = jsonb_set(
    jsonb_set(responses, '{intlAssets}', '""'),
    '{hasIntlExposure}', 'false'
  ),
  metrics = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
    metrics,
    '{total_assets}', '16400000'),
    '{net_worth}', '9750000'),
    '{fin_assets_ratio}', to_jsonb(round((8900000.0 / 16400000) * 100, 2))),
    '{solvency_ratio}', to_jsonb(round((9750000.0 / 16400000) * 100, 2))),
    '{leverage_ratio}', to_jsonb(round((6650000.0 / 16400000) * 100, 2))),
    '{acc_savings_income}', to_jsonb(round(8900000.0 / (352500 * 12), 2))),
    '{esop_concentration}', to_jsonb(round((6000000.0 / 8900000) * 100, 2))
  ),
  updated_at = now()
WHERE user_id = '5c7a0af9-63e9-435d-99e3-08a64f5c82d8';
