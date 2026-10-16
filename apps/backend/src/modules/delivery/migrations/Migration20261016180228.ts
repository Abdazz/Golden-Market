import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261016180228 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "delivery_report" add column if not exists "comment" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "delivery_report" drop column if exists "comment";`);
  }

}
