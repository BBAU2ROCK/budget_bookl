ALTER TABLE `accounts` ADD `issuer` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `card_last4` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `billing_day` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `statement_closing` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `credit_limit` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `annual_fee` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `benefits_summary` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `original_amount` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `discount_reason` text;