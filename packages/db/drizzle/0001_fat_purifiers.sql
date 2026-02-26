CREATE TABLE "profile_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_profile_reaction" UNIQUE("from_user_id","to_user_id")
);
--> statement-breakpoint
ALTER TABLE "vault_balances" ADD COLUMN "bonus" numeric(38, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_reactions" ADD CONSTRAINT "profile_reactions_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reactions" ADD CONSTRAINT "profile_reactions_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;