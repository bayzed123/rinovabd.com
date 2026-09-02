-- Staff logins the owner creates from the dashboard. The owner's own login stays in
-- the ADMIN_USERNAME / ADMIN_PASSWORD Worker secrets, which only the developer changes.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  security_question TEXT NOT NULL,
  security_answer_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(active);

-- Which principal a dashboard session belongs to, so staff actions are attributable.
ALTER TABLE admin_sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
