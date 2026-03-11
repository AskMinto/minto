-- 004_price_alerts.sql
-- Creates the price_alerts table for user-defined price notifications.

CREATE TABLE public.price_alerts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Instrument identification (one of these sets is populated)
    symbol          text,           -- e.g. "SBIN" (equity)
    exchange        text,           -- "NSE" or "BSE"
    scheme_code     integer,        -- MF scheme code
    display_name    text NOT NULL,  -- Human-readable: "SBI Bank" / "Parag Parikh Flexi Cap"

    -- Alert condition
    alert_type      text NOT NULL,  -- 'above' | 'below' | 'pct_change_up' | 'pct_change_down'
    target_value    numeric NOT NULL, -- price threshold OR % magnitude

    -- Lifecycle
    status          text NOT NULL DEFAULT 'active', -- 'active' | 'triggered' | 'cancelled'
    triggered_at    timestamptz,
    triggered_price numeric,

    created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts"
    ON public.price_alerts FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Index for the background job (scan active alerts efficiently)
CREATE INDEX price_alerts_status_idx ON public.price_alerts (status) WHERE status = 'active';
