-- Product editor note supports Bengali, English, and other Unicode plain text.
ALTER TABLE products ADD COLUMN editor_note TEXT NOT NULL DEFAULT '';
