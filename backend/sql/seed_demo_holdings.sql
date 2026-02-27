-- Seed demo holdings for the single user in the database.
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → paste → Run

DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users LIMIT 1;

  -- Clear any existing holdings
  DELETE FROM public.holdings WHERE user_id = uid;

  -- ── Equities (Zerodha style) ──
  INSERT INTO public.holdings
    (user_id, source, isin, symbol, exchange, qty, avg_cost, asset_type, sector, mcap_bucket)
  VALUES
    (uid, 'zerodha', 'INE002A01018', 'RELIANCE',   'NSE', 25,  2380.50, 'EQUITY', 'Energy',          'Large Cap'),
    (uid, 'zerodha', 'INE009A01021', 'INFY',        'NSE', 40,  1425.00, 'EQUITY', 'Technology',      'Large Cap'),
    (uid, 'zerodha', 'INE040A01034', 'HDFCBANK',    'NSE', 30,  1580.00, 'EQUITY', 'Financial',       'Large Cap'),
    (uid, 'zerodha', 'INE467B01029', 'TCS',         'NSE', 15,  3520.00, 'EQUITY', 'Technology',      'Large Cap'),
    (uid, 'zerodha', 'INE075A01022', 'WIPRO',       'NSE', 60,   420.00, 'EQUITY', 'Technology',      'Large Cap'),
    (uid, 'zerodha', 'INE585B01010', 'MARUTI',      'NSE', 5,  10250.00, 'EQUITY', 'Automobile',      'Large Cap'),
    (uid, 'zerodha', 'INE062A01020', 'SBIN',        'NSE', 80,   590.00, 'EQUITY', 'Financial',       'Large Cap'),
    (uid, 'zerodha', 'INE154A01025', 'ITC',         'NSE', 100,  410.00, 'EQUITY', 'FMCG',            'Large Cap'),
    (uid, 'zerodha', 'INE669C01036', 'DMART',       'NSE', 12,  3650.00, 'EQUITY', 'Retail',          'Large Cap'),
    (uid, 'zerodha', 'INE121A01024', 'PERSISTENT',  'NSE', 10,  4800.00, 'EQUITY', 'Technology',      'Mid Cap'),
    (uid, 'zerodha', 'INE860A01027', 'HEL',         'NSE', 50,   280.00, 'EQUITY', 'Chemical',        'Small Cap'),
    (uid, 'zerodha', 'INE397D01024', 'BHEL',        'NSE', 120,  230.00, 'EQUITY', 'Capital Goods',   'Mid Cap');

  -- ── Mutual Funds (CAS / Zerodha MF style) ──
  INSERT INTO public.holdings
    (user_id, source, isin, scheme_code, scheme_name, fund_house, qty, avg_cost, asset_type)
  VALUES
    (uid, 'cas', 'INF179K01BI0', 119598, 'HDFC Flexi Cap Fund - Direct Plan - Growth',
     'HDFC Asset Management Company Limited',
     250.500, 520.00, 'MUTUAL_FUND'),

    (uid, 'cas', 'INF090I01HD1', 120503, 'ICICI Prudential Bluechip Fund - Direct Plan - Growth',
     'ICICI Prudential Asset Management Company Limited',
     180.250, 680.00, 'MUTUAL_FUND'),

    (uid, 'cas', 'INF846K01EW2', 122639, 'Axis Small Cap Fund - Direct Plan - Growth',
     'Axis Asset Management Company Limited',
     320.100, 62.00, 'MUTUAL_FUND'),

    (uid, 'cas', 'INF209K01YQ0', 118989, 'SBI Equity Hybrid Fund - Direct Plan - Growth',
     'SBI Funds Management Limited',
     150.750, 195.00, 'MUTUAL_FUND'),

    (uid, 'cas', 'INF200K01RJ1', 120716, 'Kotak Emerging Equity Fund - Direct Plan - Growth',
     'Kotak Mahindra Asset Management Company Limited',
     200.000, 78.00, 'MUTUAL_FUND'),

    (uid, 'cas', 'INF179K01CE8', 119551, 'HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth',
     'HDFC Asset Management Company Limited',
     140.300, 310.00, 'MUTUAL_FUND');

END $$;
