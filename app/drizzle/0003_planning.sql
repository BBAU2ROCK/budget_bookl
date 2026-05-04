CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`includes_descendants` integer DEFAULT true NOT NULL,
	`carry_over` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bg_period` ON `budgets` (`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_bg_category` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE TABLE `savings_goal_accounts` (
	`goal_id` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`goal_id`, `account_id`),
	FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sga_account` ON `savings_goal_accounts` (`account_id`);--> statement-breakpoint
CREATE TABLE `savings_goal_tags` (
	`goal_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`goal_id`, `tag_id`),
	FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sgt_tag` ON `savings_goal_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`target_amount` integer NOT NULL,
	`currency` text NOT NULL,
	`start_date` text NOT NULL,
	`target_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`achieved_at` integer,
	`starting_balance` integer DEFAULT 0 NOT NULL,
	`manual_amount` integer,
	`tag_inclusion_types` text DEFAULT '["income","transfer_in"]' NOT NULL,
	`icon` text,
	`color` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sg_status` ON `savings_goals` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sg_target_date` ON `savings_goals` (`target_date`);