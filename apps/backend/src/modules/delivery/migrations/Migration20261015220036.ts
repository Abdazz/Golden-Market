import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261015220036 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "delivery_report" drop constraint if exists "delivery_report_delivery_id_unique";`);
    this.addSql(`create table if not exists "delivery_report" ("id" text not null, "delivery_id" text not null, "courier_id" text not null, "status" text check ("status" in ('submitted', 'returned', 'validated', 'applied')) not null default 'submitted', "delivered" boolean not null, "failure_reason" text null, "amount_collected" integer null, "courier_fee" integer null, "transport_fee" integer null, "return_reason" text null, "submitted_at" timestamptz not null, "validated_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_report_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_report_delivery_id_unique" ON "delivery_report" ("delivery_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_report_deleted_at" ON "delivery_report" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_report_courier_id" ON "delivery_report" ("courier_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_report_status" ON "delivery_report" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "courier" add column if not exists "pin_hash" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_report" cascade;`);

    this.addSql(`alter table if exists "courier" drop column if exists "pin_hash";`);
  }

}
