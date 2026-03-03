CREATE TABLE `calc_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buy_price_usd_oz` decimal(10,4) NOT NULL,
	`sell_price_vnd_wan` decimal(10,2) NOT NULL,
	`rate_vnd_usd` decimal(12,2) NOT NULL,
	`weight_g` decimal(8,2) NOT NULL,
	`expense_usd` decimal(10,2) NOT NULL,
	`total_cost_usd` decimal(12,4) NOT NULL,
	`total_revenue_usd` decimal(12,4) NOT NULL,
	`net_profit_usd` decimal(12,4) NOT NULL,
	`roi` decimal(8,4) NOT NULL,
	`session_id` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calc_history_id` PRIMARY KEY(`id`)
);
