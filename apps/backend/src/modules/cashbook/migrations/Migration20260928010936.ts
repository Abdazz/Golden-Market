import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260928010936 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cash_entry" drop constraint if exists "cash_entry_reference_unique";`);
    this.addSql(`create table if not exists "cash_entry" ("id" text not null, "date" timestamptz not null, "direction" text check ("direction" in ('in', 'out')) not null, "amount" integer not null, "category" text check ("category" in ('sale', 'refund', 'courier_fee', 'transport_fee', 'purchase', 'advertising', 'opening_balance', 'other_in', 'other_out')) not null, "label" text not null, "note" text null, "source" text check ("source" in ('auto', 'manual')) not null, "reference" text null, "order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cash_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cash_entry_deleted_at" ON "cash_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cash_entry_date" ON "cash_entry" ("date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cash_entry_reference_unique" ON "cash_entry" ("reference") WHERE reference IS NOT NULL AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cash_entry" cascade;`);
  }

}
