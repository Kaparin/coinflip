CREATE TABLE "bets" (
	"bet_id" bigint PRIMARY KEY NOT NULL,
	"maker_user_id" uuid NOT NULL,
	"acceptor_user_id" uuid,
	"amount" numeric(38, 0) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"commitment" text NOT NULL,
	"maker_side" text,
	"maker_secret" text,
	"acceptor_guess" text,
	"created_height" bigint,
	"accepted_height" bigint,
	"resolved_height" bigint,
	"created_time" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_time" timestamp with time zone,
	"resolved_time" timestamp with time zone,
	"winner_user_id" uuid,
	"commission_amount" numeric(38, 0),
	"payout_amount" numeric(38, 0),
	"txhash_create" text NOT NULL,
	"txhash_accept" text,
	"txhash_resolve" text
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'joined',
	"final_metric" numeric(38, 0),
	"final_rank" integer,
	"prize_amount" numeric(38, 0),
	"prize_tx_hash" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_event_user_uniq" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"prizes" jsonb DEFAULT '[]' NOT NULL,
	"total_prize_pool" numeric(38, 0) DEFAULT '0',
	"results" jsonb,
	"raffle_seed" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_bet_secrets" (
	"commitment" text PRIMARY KEY NOT NULL,
	"maker_side" text NOT NULL,
	"maker_secret" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_balances" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"unclaimed" numeric(38, 0) DEFAULT '0' NOT NULL,
	"total_earned" numeric(38, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_owner_user_id_unique" UNIQUE("owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"from_player_user_id" uuid NOT NULL,
	"bet_id" numeric(38, 0) NOT NULL,
	"amount" numeric(38, 0) NOT NULL,
	"level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ref_rewards_bet_recipient_level_uniq" UNIQUE("bet_id","recipient_user_id","level")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "relayer_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_hash" text,
	"user_address" text NOT NULL,
	"contract_address" text,
	"action" text NOT NULL,
	"action_payload" jsonb,
	"memo" text,
	"success" boolean,
	"code" integer,
	"raw_log" text,
	"height" integer,
	"duration_ms" integer,
	"attempt" integer,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authz_enabled" boolean DEFAULT false NOT NULL,
	"fee_sponsored" boolean DEFAULT false NOT NULL,
	"authz_expiration_time" timestamp with time zone,
	"limits_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"txhash" text NOT NULL,
	"amount" numeric(38, 0) NOT NULL,
	"denom" text DEFAULT 'LAUNCH' NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tx_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"txhash" text NOT NULL,
	"height" bigint NOT NULL,
	"event_type" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"profile_nickname" text,
	"avatar_url" text,
	"referrer_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "vault_balances" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"available" numeric(38, 0) DEFAULT '0' NOT NULL,
	"locked" numeric(38, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_height" bigint
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_maker_user_id_users_id_fk" FOREIGN KEY ("maker_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_acceptor_user_id_users_id_fk" FOREIGN KEY ("acceptor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_winner_user_id_users_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_balances" ADD CONSTRAINT "referral_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_from_player_user_id_users_id_fk" FOREIGN KEY ("from_player_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_balances" ADD CONSTRAINT "vault_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_status_idx" ON "bets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bets_maker_idx" ON "bets" USING btree ("maker_user_id");--> statement-breakpoint
CREATE INDEX "bets_acceptor_idx" ON "bets" USING btree ("acceptor_user_id");--> statement-breakpoint
CREATE INDEX "bets_created_time_idx" ON "bets" USING btree ("created_time");--> statement-breakpoint
CREATE INDEX "bets_status_created_idx" ON "bets" USING btree ("status","created_time");--> statement-breakpoint
CREATE INDEX "bets_maker_status_idx" ON "bets" USING btree ("maker_user_id","status");--> statement-breakpoint
CREATE INDEX "bets_acceptor_status_idx" ON "bets" USING btree ("acceptor_user_id","status");--> statement-breakpoint
CREATE INDEX "bets_status_resolved_idx" ON "bets" USING btree ("status","resolved_time");--> statement-breakpoint
CREATE INDEX "bets_txhash_create_idx" ON "bets" USING btree ("txhash_create");--> statement-breakpoint
CREATE INDEX "bets_txhash_accept_idx" ON "bets" USING btree ("txhash_accept");--> statement-breakpoint
CREATE INDEX "bets_commitment_idx" ON "bets" USING btree ("commitment");--> statement-breakpoint
CREATE INDEX "event_participants_event_idx" ON "event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_participants_user_idx" ON "event_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_type_status_idx" ON "events" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_ends_at_idx" ON "events" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "ref_rewards_recipient_idx" ON "referral_rewards" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "ref_rewards_bet_idx" ON "referral_rewards" USING btree ("bet_id");--> statement-breakpoint
CREATE INDEX "ref_rewards_from_player_idx" ON "referral_rewards" USING btree ("from_player_user_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "relayer_tx_created_at_idx" ON "relayer_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "relayer_tx_action_idx" ON "relayer_transactions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "relayer_tx_user_address_idx" ON "relayer_transactions" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "relayer_tx_tx_hash_idx" ON "relayer_transactions" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "tx_events_txhash_idx" ON "tx_events" USING btree ("txhash");--> statement-breakpoint
CREATE INDEX "tx_events_event_type_idx" ON "tx_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "tx_events_height_idx" ON "tx_events" USING btree ("height");--> statement-breakpoint
CREATE INDEX "tx_events_txhash_type_idx" ON "tx_events" USING btree ("txhash","event_type");