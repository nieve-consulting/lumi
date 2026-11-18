CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."apiKeyAccess" AS ENUM('read_only', 'admin');--> statement-breakpoint
CREATE TYPE "public"."jobWorkMode" AS ENUM('REMOTE', 'HYBRID', 'ONSITE');--> statement-breakpoint
CREATE TYPE "public"."projectLocation" AS ENUM('REMOTE', 'HYBRID', 'ONSITE');--> statement-breakpoint
CREATE TYPE "public"."uploadState" AS ENUM('CREATED', 'UPLOADED');--> statement-breakpoint
CREATE TYPE "public"."websiteCrawlKind" AS ENUM('update', 'reprocess');--> statement-breakpoint
CREATE TYPE "public"."websiteCrawlStatus" AS ENUM('queued', 'running', 'completed', 'stopped', 'failed');--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_sign_in_at" timestamp,
	"password_changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sign_in_failures" (
	"bucket" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admin_sign_in_failures_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "admin_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"admin_email" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cost" double precision
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"access" "apiKeyAccess" NOT NULL,
	"secret_hash" text NOT NULL,
	"last_characters" text NOT NULL,
	"created_by" text,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "appointment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"meeting_duration_mins" integer NOT NULL,
	"allowed_times" jsonb NOT NULL,
	"min_available_time_before_slot" integer NOT NULL,
	"allowed_days" integer[] NOT NULL,
	"same_day_min_hours" integer NOT NULL,
	"max_days_out" integer NOT NULL,
	"host_timezone" text NOT NULL,
	"calendars" text[] NOT NULL,
	"booking_email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"business_name" text NOT NULL,
	"website_url" text,
	"careers_url" text,
	"contact_url" text,
	"contact_email" text,
	"contact_phone" text,
	"assistant_name" text,
	"avatar_url" text,
	"logo_url" text,
	"primary_color" text,
	"default_language" varchar(16),
	"starters" jsonb,
	"greeting" jsonb,
	"agent_description" text,
	"agent_guidance" text,
	CONSTRAINT "business_settings_singleton" CHECK ("business_settings"."id" = true)
);
--> statement-breakpoint
CREATE TABLE "capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_translations" (
	"capability_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"name" varchar(256),
	"description" text,
	CONSTRAINT "capability_translations_capability_id_language_pk" PRIMARY KEY("capability_id","language"),
	CONSTRAINT "capability_translations_language_check" CHECK ("capability_translations"."language" ~ '^[a-z]{2,3}$'),
	CONSTRAINT "capability_translations_english_required" CHECK ("capability_translations"."language" <> 'en' or "capability_translations"."name" is not null)
);
--> statement-breakpoint
CREATE TABLE "client_translations" (
	"client_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"summary" text,
	"description" text,
	CONSTRAINT "client_translations_client_id_language_pk" PRIMARY KEY("client_id","language"),
	CONSTRAINT "client_translations_language_check" CHECK ("client_translations"."language" ~ '^[a-z]{2,3}$'),
	CONSTRAINT "client_translations_english_required" CHECK ("client_translations"."language" <> 'en' or "client_translations"."summary" is not null)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(256) NOT NULL,
	"url_slug" varchar(256) NOT NULL,
	"interal_webpage" varchar(256),
	"client_website" varchar(256),
	"published" boolean DEFAULT false NOT NULL,
	"logo_key" uuid,
	CONSTRAINT "clients_url_slug_unique" UNIQUE("url_slug")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"location" varchar(256) NOT NULL,
	"phone" varchar(256) NOT NULL,
	"email" varchar(256) NOT NULL,
	"url" varchar(256)
);
--> statement-breakpoint
CREATE TABLE "company_translations" (
	"company_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"founding_story" text,
	"values" text,
	"mission" text,
	"vision" text,
	CONSTRAINT "company_translations_company_id_language_pk" PRIMARY KEY("company_id","language"),
	CONSTRAINT "company_translations_language_check" CHECK ("company_translations"."language" ~ '^[a-z]{2,3}$')
);
--> statement-breakpoint
CREATE TABLE "daily_conversation_spend" (
	"day" date PRIMARY KEY NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"thread_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"contact" jsonb NOT NULL,
	"qualification" jsonb NOT NULL,
	"message" text,
	"topic" text
);
--> statement-breakpoint
CREATE TABLE "enquiry_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"channel_key" text NOT NULL,
	"channel_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enquiry_deliveries_status" CHECK ("enquiry_deliveries"."status" in ('pending', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(256) NOT NULL,
	"logo_key" uuid,
	"location" varchar(256) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"team_member_id" uuid
);
--> statement-breakpoint
CREATE TABLE "experience_translations" (
	"experience_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"position" varchar(256),
	"description" text,
	CONSTRAINT "experience_translations_experience_id_language_pk" PRIMARY KEY("experience_id","language"),
	CONSTRAINT "experience_translations_language_check" CHECK ("experience_translations"."language" ~ '^[a-z]{2,3}$'),
	CONSTRAINT "experience_translations_english_required" CHECK ("experience_translations"."language" <> 'en' or "experience_translations"."position" is not null)
);
--> statement-breakpoint
CREATE TABLE "handoff_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"qualification_questions" jsonb NOT NULL,
	"enquiry_fields" jsonb NOT NULL,
	"booking" jsonb NOT NULL,
	"enquiry_enabled" boolean DEFAULT false NOT NULL,
	"delivery_channels" jsonb NOT NULL,
	CONSTRAINT "handoff_settings_singleton" CHECK ("handoff_settings"."id" = true)
);
--> statement-breakpoint
CREATE TABLE "job_opening_translations" (
	"job_opening_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"title" varchar(256),
	"summary" text,
	"description" text,
	CONSTRAINT "job_opening_translations_job_opening_id_language_pk" PRIMARY KEY("job_opening_id","language"),
	CONSTRAINT "job_opening_translations_language_check" CHECK ("job_opening_translations"."language" ~ '^[a-z]{2,3}$'),
	CONSTRAINT "job_opening_translations_english_required" CHECK ("job_opening_translations"."language" <> 'en' or "job_opening_translations"."title" is not null)
);
--> statement-breakpoint
CREATE TABLE "job_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"url_slug" varchar(256) NOT NULL,
	"location" varchar(256) NOT NULL,
	"work_mode" "jobWorkMode" NOT NULL,
	"application_url" varchar(256),
	"posted_at" timestamp NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "job_openings_url_slug_unique" UNIQUE("url_slug")
);
--> statement-breakpoint
CREATE TABLE "knowledge_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"team_members_enabled" boolean NOT NULL,
	"projects_enabled" boolean NOT NULL,
	"clients_enabled" boolean NOT NULL,
	"capabilities_enabled" boolean NOT NULL,
	"job_openings_enabled" boolean DEFAULT false NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "knowledge_settings_singleton" CHECK ("knowledge_settings"."id" = true)
);
--> statement-breakpoint
CREATE TABLE "mcp_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"actor_sub" text NOT NULL,
	"actor_email" text NOT NULL,
	"client_id" text,
	"tool" text NOT NULL,
	"record_type" text,
	"record_id" text,
	"outcome" text NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "mcp_idempotency_keys" (
	"actor" text NOT NULL,
	"tool" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	CONSTRAINT "mcp_idempotency_keys_actor_tool_key_pk" PRIMARY KEY("actor","tool","key")
);
--> statement-breakpoint
CREATE TABLE "mcp_rate_limits" (
	"bucket" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mcp_rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scopes" text[] NOT NULL,
	"resource" text NOT NULL,
	"user_sub" text NOT NULL,
	"user_email" text NOT NULL,
	"user_name" text,
	"family_id" uuid NOT NULL,
	"signed_in_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"client_name" text,
	"redirect_uris" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"family_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"scopes" text[] NOT NULL,
	"resource" text NOT NULL,
	"user_sub" text NOT NULL,
	"user_email" text NOT NULL,
	"user_name" text,
	"signed_in_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_capabilities" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid,
	"capability_id" uuid,
	CONSTRAINT "project_capabilities_project_id_capability_id_pk" PRIMARY KEY("project_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "project_team_member_translations" (
	"team_member_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"description" text,
	CONSTRAINT "project_team_member_translations_pk" PRIMARY KEY("team_member_id","project_id","language"),
	CONSTRAINT "project_team_member_translations_language_check" CHECK ("project_team_member_translations"."language" ~ '^[a-z]{2,3}$')
);
--> statement-breakpoint
CREATE TABLE "project_team_members" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	CONSTRAINT "project_team_members_team_member_id_project_id_pk" PRIMARY KEY("team_member_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "project_translations" (
	"project_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"name" varchar(256),
	"summary" text,
	"description" text,
	"industry" varchar(50),
	"type" varchar(50),
	CONSTRAINT "project_translations_project_id_language_pk" PRIMARY KEY("project_id","language"),
	CONSTRAINT "project_translations_language_check" CHECK ("project_translations"."language" ~ '^[a-z]{2,3}$'),
	CONSTRAINT "project_translations_english_required" CHECK ("project_translations"."language" <> 'en' or "project_translations"."name" is not null)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"url_slug" varchar(256) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"location" "projectLocation" NOT NULL,
	"image_key" uuid,
	"client_id" uuid,
	"url" varchar(256),
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "projects_url_slug_unique" UNIQUE("url_slug")
);
--> statement-breakpoint
CREATE TABLE "resume_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"logo_url" text,
	"header_color" text,
	"accent_color" text,
	"gradient_color" text,
	"footer_text" text,
	CONSTRAINT "resume_settings_singleton" CHECK ("resume_settings"."id" = true)
);
--> statement-breakpoint
CREATE TABLE "team_member_capabilities" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"stars" smallint DEFAULT 1 NOT NULL,
	"team_member_id" uuid,
	"capability_id" uuid,
	CONSTRAINT "team_member_capabilities_team_member_id_capability_id_pk" PRIMARY KEY("team_member_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "team_member_translations" (
	"team_member_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_version" varchar(32),
	"draft" boolean DEFAULT false NOT NULL,
	"job_title" varchar(256),
	"capability_highlights" text,
	"bio" text,
	"education" text,
	CONSTRAINT "team_member_translations_team_member_id_language_pk" PRIMARY KEY("team_member_id","language"),
	CONSTRAINT "team_member_translations_language_check" CHECK ("team_member_translations"."language" ~ '^[a-z]{2,3}$'),
	CONSTRAINT "team_member_translations_english_required" CHECK ("team_member_translations"."language" <> 'en' or "team_member_translations"."job_title" is not null)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(256) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"url_slug" varchar(256) NOT NULL,
	"profile_photo_key" uuid,
	"url" varchar(256),
	CONSTRAINT "team_members_url_slug_unique" UNIQUE("url_slug")
);
--> statement-breakpoint
CREATE TABLE "thread_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"thread_id" uuid NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cost" double precision
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"topic" text,
	"summary" text,
	"email" text,
	"phone" text,
	"name" text,
	"page_url" text,
	"cost" double precision,
	"unpriced_calls" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"key" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"content_type" varchar(256) NOT NULL,
	"state" "uploadState" DEFAULT 'CREATED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_crawls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"website_id" uuid NOT NULL,
	"kind" "websiteCrawlKind" DEFAULT 'update' NOT NULL,
	"admin_email" text,
	"status" "websiteCrawlStatus" DEFAULT 'queued' NOT NULL,
	"pages_total" integer,
	"pages_checked" integer DEFAULT 0 NOT NULL,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	"pages_removed" integer DEFAULT 0 NOT NULL,
	"pages_over_limit" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "website_page_vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text,
	"metadata" jsonb,
	"vector" vector(1536),
	"webpage_id" uuid GENERATED ALWAYS AS ((metadata->>'webpageId')::uuid) STORED
);
--> statement-breakpoint
CREATE TABLE "website_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"website_id" uuid,
	"path" text NOT NULL,
	"title" text,
	"last_processed" timestamp,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_processed" timestamp,
	"name" varchar(256) NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"sitemap" text NOT NULL,
	"exclude_paths" text[]
);
--> statement-breakpoint
ALTER TABLE "capability_translations" ADD CONSTRAINT "capability_translations_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_translations" ADD CONSTRAINT "client_translations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_logo_key_uploads_key_fk" FOREIGN KEY ("logo_key") REFERENCES "public"."uploads"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_translations" ADD CONSTRAINT "company_translations_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_deliveries" ADD CONSTRAINT "enquiry_deliveries_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_logo_key_uploads_key_fk" FOREIGN KEY ("logo_key") REFERENCES "public"."uploads"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_translations" ADD CONSTRAINT "experience_translations_experience_id_experience_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening_translations" ADD CONSTRAINT "job_opening_translations_job_opening_id_job_openings_id_fk" FOREIGN KEY ("job_opening_id") REFERENCES "public"."job_openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_member_translations" ADD CONSTRAINT "project_team_member_translations_project_team_members_fk" FOREIGN KEY ("team_member_id","project_id") REFERENCES "public"."project_team_members"("team_member_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_image_key_uploads_key_fk" FOREIGN KEY ("image_key") REFERENCES "public"."uploads"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_capabilities" ADD CONSTRAINT "team_member_capabilities_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_capabilities" ADD CONSTRAINT "team_member_capabilities_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_translations" ADD CONSTRAINT "team_member_translations_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_profile_photo_key_uploads_key_fk" FOREIGN KEY ("profile_photo_key") REFERENCES "public"."uploads"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_usage" ADD CONSTRAINT "thread_usage_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_crawls" ADD CONSTRAINT "website_crawls_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_page_vectors" ADD CONSTRAINT "website_page_vectors_webpage_id_website_pages_id_fk" FOREIGN KEY ("webpage_id") REFERENCES "public"."website_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_accounts_email_idx" ON "admin_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_usage_created_at_idx" ON "admin_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_secret_hash_idx" ON "api_keys" USING btree ("secret_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiries_thread_submission_idx" ON "enquiries" USING btree ("thread_id","submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiry_deliveries_enquiry_channel_idx" ON "enquiry_deliveries" USING btree ("enquiry_id","channel_key");--> statement-breakpoint
CREATE INDEX "mcp_audit_events_created_at_idx" ON "mcp_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_family_id_idx" ON "oauth_refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "url_slug_index" ON "team_members" USING btree ("url_slug");--> statement-breakpoint
CREATE INDEX "thread_usage_thread_id_idx" ON "thread_usage" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "thread_usage_created_at_idx" ON "thread_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "threads_created_at_idx" ON "threads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "website_crawls_website_id_created_at_idx" ON "website_crawls" USING btree ("website_id","created_at");--> statement-breakpoint
CREATE INDEX "website_page_vectors_vector_idx" ON "website_page_vectors" USING hnsw ("vector" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "website_page_vectors_webpage_id_idx" ON "website_page_vectors" USING btree ("webpage_id");
