-- Sticky notes for the Big Sky desktop guestbook.
-- Apply with: npx wrangler d1 execute bigsky --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,             -- ISO 8601, UTC
  name TEXT NOT NULL DEFAULT '',        -- up to 40 characters
  place TEXT NOT NULL DEFAULT '',       -- up to 40 characters
  message TEXT NOT NULL DEFAULT '',     -- up to 140 characters
  paper TEXT NOT NULL,                  -- butter, mint, sky or blush
  image TEXT,                           -- data:image/png;base64,..., at most 60 KB decoded
  hidden INTEGER NOT NULL DEFAULT 0     -- 1 once a moderator hides it
);

-- The wall reads visible notes newest first, a page at a time.
CREATE INDEX IF NOT EXISTS notes_wall ON notes (hidden, id DESC);
