CREATE TABLE "dealer_invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "app_role" NOT NULL,
	"dealer_brand" "dealer_brand",
	"dealer_code" text,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dealer_invite_codes_code_hash" ON "dealer_invite_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "idx_dealer_invite_codes_status" ON "dealer_invite_codes" USING btree ("dealer_brand","dealer_code","used_at","expires_at");
--> statement-breakpoint
ALTER TABLE "dealer_invite_codes" ADD CONSTRAINT "dealer_invite_codes_dealer_scope_check" CHECK (
  ("role" = 'dealer' AND "dealer_brand" IS NOT NULL)
  OR ("role" <> 'dealer')
);
