CREATE TYPE "public"."app_role" AS ENUM('super', 'manager', 'dealer');--> statement-breakpoint
CREATE TYPE "public"."dealer_brand" AS ENUM('BMW', 'BENZ', 'AUDI', 'HYUNDAI', 'KIA', 'GENESIS', 'ETC');--> statement-breakpoint
CREATE TABLE "dealer_discounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dealer_user_id" uuid,
	"dealer_code" text NOT NULL,
	"source_type" text NOT NULL,
	"snapshot_month" date NOT NULL,
	"maker_name" text NOT NULL,
	"model_name" text NOT NULL,
	"detail_model_name" text NOT NULL,
	"discount_amount" numeric(14, 0) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residual_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"upload_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"maker_name" text NOT NULL,
	"model_name" text NOT NULL,
	"lineup_name" text NOT NULL,
	"detail_model_name" text NOT NULL,
	"term_months" integer NOT NULL,
	"annual_mileage_km" integer NOT NULL,
	"finance_name" text NOT NULL,
	"residual_value_percent" numeric(5, 2) NOT NULL,
	"snapshot_month" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_file_name" text NOT NULL,
	"snapshot_month" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"dealer_brand" "dealer_brand",
	"dealer_code" text,
	"dealer_scope" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
