-- 0005_transaction_splits.sql
-- One transaction can be split across multiple categories. The parent
-- `transactions` row keeps the total, payee, date, account, etc. The
-- `transaction_splits` rows redistribute the amount across categories so
-- that category breakdowns and budget vs actual reflect the user's intent.
--
-- Rule: when at least one split exists for a transaction, stats aggregation
-- uses those splits. When none exist, the parent transaction's category_id
-- is used (backward-compatible).
--
-- Constraint: sum(splits.amount) MUST equal parent.amount; enforced in the
-- repository layer (sqlite has no easy way to enforce a cross-row check
-- declaratively).

CREATE TABLE `transaction_splits` (
  `id` text PRIMARY KEY NOT NULL,
  `transaction_id` text NOT NULL,
  `category_id` text,
  -- Split's own slice of the parent's `amount` (in the same currency).
  `amount` integer NOT NULL,
  -- Same slice converted to base currency at parent's fx_rate so cross-currency
  -- splits don't need to re-derive FX state. Stored explicitly to keep
  -- aggregation queries simple.
  `amount_in_base` integer NOT NULL,
  `memo` text,
  `display_order` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_split_tx` ON `transaction_splits` (`transaction_id`);
--> statement-breakpoint
CREATE INDEX `idx_split_category` ON `transaction_splits` (`category_id`);
