-- The dashboard login counted nothing and locked nobody out, so an attacker could try
-- passwords against the owner account as fast as the network allowed. This records failures
-- so repeated guessing can be slowed to a stop.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,          -- lowercased; the account being guessed at
  ip TEXT,                         -- the caller, so one attacker cannot spray many usernames
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_username ON admin_login_attempts(username, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip ON admin_login_attempts(ip, created_at);
