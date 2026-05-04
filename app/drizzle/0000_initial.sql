CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`initial_balance` integer DEFAULT 0 NOT NULL,
	`color` text,
	`icon` text,
	`notes` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`file_path` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text,
	`size` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`color` text,
	`icon` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_cat_parent` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_cat_kind` ON `categories` (`kind`);--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`decimal_places` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`from_currency` text NOT NULL,
	`to_currency` text NOT NULL,
	`rate` real NOT NULL,
	`as_of` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`from_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_fx_as_of` ON `exchange_rates` (`as_of`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fx_pair_date` ON `exchange_rates` (`from_currency`,`to_currency`,`as_of`);--> statement-breakpoint
CREATE TABLE `recurring_series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`category_id` text,
	`account_id` text,
	`payee` text,
	`memo` text,
	`payment_method` text,
	`rrule` text NOT NULL,
	`dtstart` text NOT NULL,
	`until` text,
	`count` integer,
	`next_occurrence` text,
	`auto_create` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_rec_next` ON `recurring_series` (`next_occurrence`);--> statement-breakpoint
CREATE INDEX `idx_rec_active` ON `recurring_series` (`is_active`);--> statement-breakpoint
CREATE TABLE `recurring_tags` (
	`series_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`series_id`, `tag_id`),
	FOREIGN KEY (`series_id`) REFERENCES `recurring_series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`description` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `transaction_tags` (
	`transaction_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`transaction_id`, `tag_id`),
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_txtag_tag` ON `transaction_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`amount_in_base` integer NOT NULL,
	`base_currency` text NOT NULL,
	`fx_rate` real DEFAULT 1 NOT NULL,
	`category_id` text,
	`account_id` text,
	`counter_account_id` text,
	`payee` text,
	`memo` text,
	`payment_method` text,
	`recurring_series_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`base_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`counter_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_series_id`) REFERENCES `recurring_series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tx_occurred` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_tx_type` ON `transactions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_tx_category` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_account` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_recurring` ON `transactions` (`recurring_series_id`);