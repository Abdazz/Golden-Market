import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260928012208 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "variant_cost" drop constraint if exists "variant_cost_variant_id_unique";`);
    this.addSql(`create table if not exists "supplier_order" ("id" text not null, "reference" text not null, "supplier" text null, "status" text check ("status" in ('draft', 'ordered', 'received', 'canceled')) not null default 'draft', "ordered_at" timestamptz null, "received_at" timestamptz null, "exchange_rate" real not null default 670, "fee_rate" real not null default 0.0299, "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supplier_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supplier_order_deleted_at" ON "supplier_order" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "supplier_order_line" ("id" text not null, "variant_id" text not null, "title" text not null, "quantity" integer not null, "unit_price_usd" real not null, "freight_usd" real not null default 0, "transport_xof" real not null default 0, "ads_usd" real not null default 0, "unit_cost_xof" real null, "supplier_order_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supplier_order_line_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supplier_order_line_supplier_order_id" ON "supplier_order_line" ("supplier_order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supplier_order_line_deleted_at" ON "supplier_order_line" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "variant_cost" ("id" text not null, "variant_id" text not null, "unit_cost_xof" real not null, "source_line_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "variant_cost_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_variant_cost_deleted_at" ON "variant_cost" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_variant_cost_variant_id_unique" ON "variant_cost" ("variant_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "supplier_order_line" add constraint "supplier_order_line_supplier_order_id_foreign" foreign key ("supplier_order_id") references "supplier_order" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "supplier_order_line" drop constraint if exists "supplier_order_line_supplier_order_id_foreign";`);

    this.addSql(`drop table if exists "supplier_order" cascade;`);

    this.addSql(`drop table if exists "supplier_order_line" cascade;`);

    this.addSql(`drop table if exists "variant_cost" cascade;`);
  }

}
