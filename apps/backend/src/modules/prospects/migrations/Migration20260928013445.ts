import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260928013445 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "prospect" ("id" text not null, "phone" text not null, "name" text null, "variant_id" text null, "product_label" text null, "status" text check ("status" in ('to_follow_up', 'waiting_stock', 'converted', 'lost')) not null default 'to_follow_up', "follow_up_on" text null, "last_contacted_at" timestamptz null, "follow_up_count" integer not null default 0, "note" text null, "order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "prospect_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_prospect_deleted_at" ON "prospect" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_prospect_phone" ON "prospect" ("phone") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_prospect_status" ON "prospect" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "prospect" cascade;`);
  }

}
