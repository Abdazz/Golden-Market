import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261016184813 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "courier" add column if not exists "pin_cipher" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "courier" drop column if exists "pin_cipher";`);
  }

}
