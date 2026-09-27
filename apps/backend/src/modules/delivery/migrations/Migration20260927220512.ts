import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927220512 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "courier_settlement" drop constraint if exists "courier_settlement_courier_id_day_unique";`);
    this.addSql(`create table if not exists "courier" ("id" text not null, "name" text not null, "phone" text not null, "active" boolean not null default true, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "courier_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_deleted_at" ON "courier" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "courier_settlement" ("id" text not null, "courier_id" text not null, "day" text not null, "expected_amount" integer not null, "received_amount" integer not null, "validated_at" timestamptz not null, "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "courier_settlement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_settlement_deleted_at" ON "courier_settlement" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_courier_settlement_courier_id_day_unique" ON "courier_settlement" ("courier_id", "day") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "delivery" ("id" text not null, "order_id" text not null, "courier_id" text not null, "tour_date" text not null, "assigned_at" timestamptz not null, "completed_at" timestamptz null, "postponed_count" integer not null default 0, "first_tour_date" text not null, "type" text check ("type" in ('express', 'expedition')) not null, "status" text check ("status" in ('assigned', 'delivered', 'failed', 'shipped', 'canceled')) not null default 'assigned', "address" text null, "transport_company" text null, "destination_city" text null, "parcel_reference" text null, "failure_reason" text null, "redeliver" boolean not null default false, "amount_to_collect" integer not null default 0, "amount_collected" integer null, "courier_fee" integer null, "transport_fee" integer null, "whatsapp_status" text check ("whatsapp_status" in ('pending', 'sent', 'failed')) not null default 'pending', "whatsapp_error" text null, "sync_warning" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_deleted_at" ON "delivery" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_id" ON "delivery" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_courier_id_tour_date" ON "delivery" ("courier_id", "tour_date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_status" ON "delivery" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "courier" cascade;`);

    this.addSql(`drop table if exists "courier_settlement" cascade;`);

    this.addSql(`drop table if exists "delivery" cascade;`);
  }

}
