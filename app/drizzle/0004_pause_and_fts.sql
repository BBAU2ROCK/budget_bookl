-- 0004_pause_and_fts.sql
-- Adds:
--  1. recurring_series.paused_until — temporarily disable a series until a future date.
--  2. transactions_fts — FTS5 virtual table for fast text search across payee/memo/
--     payment_method/discount_reason. Uses the trigram tokenizer so it works
--     with Korean (whitespace-tokenized FTS would treat each phrase as one token).

ALTER TABLE `recurring_series` ADD COLUMN `paused_until` text;
--> statement-breakpoint
CREATE INDEX `idx_rec_paused_until` ON `recurring_series` (`paused_until`);
--> statement-breakpoint

-- FTS5 virtual table: contentless-style with transaction_id stored as an unindexed
-- column (so we can join back to transactions). Trigram tokenizer handles Korean.
CREATE VIRTUAL TABLE `transactions_fts` USING fts5(
  `transaction_id` UNINDEXED,
  `payee`,
  `memo`,
  `payment_method`,
  `discount_reason`,
  tokenize = 'trigram'
);
--> statement-breakpoint

-- Backfill from existing transactions
INSERT INTO `transactions_fts` (
  `transaction_id`, `payee`, `memo`, `payment_method`, `discount_reason`
)
SELECT `id`, `payee`, `memo`, `payment_method`, `discount_reason`
FROM `transactions`;
--> statement-breakpoint

-- Triggers to keep FTS index in sync.
CREATE TRIGGER `transactions_fts_insert` AFTER INSERT ON `transactions`
BEGIN
  INSERT INTO `transactions_fts` (
    `transaction_id`, `payee`, `memo`, `payment_method`, `discount_reason`
  )
  VALUES (NEW.id, NEW.payee, NEW.memo, NEW.payment_method, NEW.discount_reason);
END;
--> statement-breakpoint

CREATE TRIGGER `transactions_fts_update` AFTER UPDATE ON `transactions`
BEGIN
  DELETE FROM `transactions_fts` WHERE `transaction_id` = OLD.id;
  INSERT INTO `transactions_fts` (
    `transaction_id`, `payee`, `memo`, `payment_method`, `discount_reason`
  )
  VALUES (NEW.id, NEW.payee, NEW.memo, NEW.payment_method, NEW.discount_reason);
END;
--> statement-breakpoint

CREATE TRIGGER `transactions_fts_delete` AFTER DELETE ON `transactions`
BEGIN
  DELETE FROM `transactions_fts` WHERE `transaction_id` = OLD.id;
END;
