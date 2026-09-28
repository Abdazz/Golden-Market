import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260928200539 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "courier_stock_movement" drop constraint if exists "courier_stock_movement_delivery_id_inventory_item_id_unique";`);
    this.addSql(`create table if not exists "courier_stock_movement" ("id" text not null, "courier_id" text not null, "inventory_item_id" text not null, "quantity" integer not null, "type" text check ("type" in ('handover', 'return', 'delivery', 'adjustment')) not null, "delivery_id" text null, "order_id" text null, "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "courier_stock_movement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_stock_movement_deleted_at" ON "courier_stock_movement" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_stock_movement_courier_id" ON "courier_stock_movement" ("courier_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_courier_stock_movement_delivery_id_inventory_item_id_unique" ON "courier_stock_movement" ("delivery_id", "inventory_item_id") WHERE delivery_id IS NOT NULL AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "courier_stock_movement" cascade;`);
  }

}
