PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  currency_symbol TEXT NOT NULL DEFAULT '₪',
  timezone TEXT NOT NULL DEFAULT 'Asia/Hebron',
  water_unit_name TEXT NOT NULL DEFAULT 'كوب (م³)',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  floor TEXT,
  unit_number TEXT,
  unit_type TEXT DEFAULT 'سكنية',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (building_id) REFERENCES buildings(id),
  UNIQUE (building_id, code)
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  unit_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  type TEXT NOT NULL DEFAULT 'داخلي',
  active INTEGER NOT NULL DEFAULT 1,
  default_guard_fee NUMERIC NOT NULL DEFAULT 0,
  default_pump_insurance NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (unit_id) REFERENCES units(id),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS meters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  meter_code TEXT NOT NULL,
  meter_type TEXT NOT NULL,
  subscriber_id INTEGER,
  unit_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  installed_at TEXT,
  replaced_at TEXT,
  notes TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (unit_id) REFERENCES units(id),
  UNIQUE (organization_id, meter_code)
);

CREATE TABLE IF NOT EXISTS billing_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  approved_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL,
  meter_id INTEGER NOT NULL,
  previous_reading NUMERIC,
  current_reading NUMERIC,
  consumption NUMERIC,
  unit_price NUMERIC,
  charge_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'Pending',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (period_id) REFERENCES billing_periods(id),
  FOREIGN KEY (meter_id) REFERENCES meters(id),
  UNIQUE (period_id, meter_id)
);

CREATE TABLE IF NOT EXISTS energy_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'مولد',
  provider TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS energy_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL,
  energy_source_id INTEGER NOT NULL,
  previous_reading NUMERIC,
  current_reading NUMERIC,
  loss NUMERIC NOT NULL DEFAULT 0,
  consumption NUMERIC,
  price_per_kwh NUMERIC,
  cost NUMERIC,
  notes TEXT,
  FOREIGN KEY (period_id) REFERENCES billing_periods(id),
  FOREIGN KEY (energy_source_id) REFERENCES energy_sources(id),
  UNIQUE (period_id, energy_source_id)
);

CREATE TABLE IF NOT EXISTS operational_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER,
  cost_type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  allocation_rule TEXT NOT NULL DEFAULT 'WATER_CONSUMPTION',
  vendor TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  is_credit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (period_id) REFERENCES billing_periods(id)
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  default_amount NUMERIC NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'CUSTOM',
  allocation_rule TEXT NOT NULL DEFAULT 'EACH_SUBSCRIBER',
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  period_id INTEGER,
  type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  source_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (period_id) REFERENCES billing_periods(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  payment_date TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'Cash',
  receipt_number TEXT,
  reference TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  period_id INTEGER,
  transaction_type TEXT NOT NULL,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  source_table TEXT,
  source_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (period_id) REFERENCES billing_periods(id)
);

CREATE TABLE IF NOT EXISTS emergency_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'متوسط',
  allocation_rule TEXT NOT NULL DEFAULT 'WATER_CONSUMPTION',
  event_date TEXT NOT NULL,
  vendor TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (period_id) REFERENCES billing_periods(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_readings_period ON meter_readings(period_id);
CREATE INDEX IF NOT EXISTS idx_readings_meter ON meter_readings(meter_id);
CREATE INDEX IF NOT EXISTS idx_charges_subscriber ON charges(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscriber ON payments(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_ledger_subscriber ON ledger_transactions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_periods_dates ON billing_periods(start_date, end_date);
