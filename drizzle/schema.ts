import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const appRoleEnum = pgEnum('app_role', ['super', 'manager', 'dealer'])
export const dealerBrandEnum = pgEnum('dealer_brand', [
  'BMW',
  'BENZ',
  'AUDI',
  'HYUNDAI',
  'KIA',
  'GENESIS',
  'ETC',
])

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    sourceFileName: text('source_file_name').notNull(),
    snapshotMonth: date('snapshot_month').notNull(),
    status: text('status').default('processing').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_uploads_created_at_desc').using(
      'btree',
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
  ],
)

export const residualValues = pgTable(
  'residual_values',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),
    uploadId: uuid('upload_id').notNull(),
    sourceType: text('source_type').notNull(),
    makerName: text('maker_name').notNull(),
    modelName: text('model_name').notNull(),
    lineupName: text('lineup_name').notNull(),
    detailModelName: text('detail_model_name').notNull(),
    termMonths: integer('term_months').notNull(),
    annualMileageKm: integer('annual_mileage_km').notNull(),
    financeName: text('finance_name').notNull(),
    residualValuePercent: numeric('residual_value_percent', { precision: 5, scale: 2 }).notNull(),
    snapshotMonth: date('snapshot_month').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_residual_values_best_order').using(
      'btree',
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
      table.residualValuePercent.desc().nullsFirst().op('numeric_ops'),
      table.makerName.asc().nullsLast().op('text_ops'),
      table.modelName.asc().nullsLast().op('text_ops'),
      table.lineupName.asc().nullsLast().op('text_ops'),
      table.detailModelName.asc().nullsLast().op('text_ops'),
      table.termMonths.asc().nullsLast().op('int4_ops'),
      table.annualMileageKm.asc().nullsLast().op('int4_ops'),
    ),
    index('idx_residual_values_changes_key').using(
      'btree',
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
      table.makerName.asc().nullsLast().op('text_ops'),
      table.modelName.asc().nullsLast().op('text_ops'),
      table.lineupName.asc().nullsLast().op('text_ops'),
      table.detailModelName.asc().nullsLast().op('text_ops'),
      table.termMonths.asc().nullsLast().op('int4_ops'),
      table.annualMileageKm.asc().nullsLast().op('int4_ops'),
      table.financeName.asc().nullsLast().op('text_ops'),
    ),
    index('idx_residual_values_detail_model').using(
      'btree',
      table.detailModelName.asc().nullsLast().op('text_ops'),
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
    ),
    index('idx_residual_values_detail_trgm').using(
      'gin',
      table.detailModelName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('idx_residual_values_finance_trgm').using(
      'gin',
      table.financeName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('idx_residual_values_lineup_trgm').using(
      'gin',
      table.lineupName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('idx_residual_values_maker_model').using(
      'btree',
      table.makerName.asc().nullsLast().op('text_ops'),
      table.modelName.asc().nullsLast().op('text_ops'),
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
    ),
    index('idx_residual_values_maker_trgm').using(
      'gin',
      table.makerName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('idx_residual_values_model_trgm').using(
      'gin',
      table.modelName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('idx_residual_values_source_snapshot').using(
      'btree',
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
    ),
    index('idx_residual_values_source_snapshot_term_km').using(
      'btree',
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
      table.termMonths.asc().nullsLast().op('int4_ops'),
      table.annualMileageKm.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.uploadId],
      foreignColumns: [uploads.id],
      name: 'residual_values_upload_id_fkey',
    }).onDelete('cascade'),
    check(
      'residual_values_source_type_check',
      sql`source_type = ANY (ARRAY['lease'::text, 'rent'::text])`,
    ),
  ],
)

export const dealerDiscounts = pgTable(
  'dealer_discounts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),
    dealerUserId: uuid('dealer_user_id').notNull(),
    dealerCode: text('dealer_code').notNull(),
    makerName: text('maker_name').notNull(),
    modelName: text('model_name').notNull(),
    detailModelName: text('detail_model_name').notNull(),
    discountAmount: numeric('discount_amount', { precision: 14, scale: 0 }),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    sourceType: text('source_type').notNull(),
    snapshotMonth: date('snapshot_month').notNull(),
  },
  (table) => [
    index('idx_dealer_discounts_brand_snapshot').using(
      'btree',
      table.makerName.asc().nullsLast().op('text_ops'),
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
      table.updatedAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    uniqueIndex('uq_dealer_discounts_target').using(
      'btree',
      table.dealerCode.asc().nullsLast().op('text_ops'),
      table.sourceType.asc().nullsLast().op('text_ops'),
      table.snapshotMonth.asc().nullsLast().op('date_ops'),
      table.makerName.asc().nullsLast().op('text_ops'),
      table.modelName.asc().nullsLast().op('text_ops'),
      table.detailModelName.asc().nullsLast().op('text_ops'),
    ),
    check(
      'dealer_discounts_source_type_check',
      sql`source_type = ANY (ARRAY['lease'::text, 'rent'::text])`,
    ),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').primaryKey().notNull(),
    role: appRoleEnum('role').notNull(),
    dealerScope: text('dealer_scope').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    dealerBrand: dealerBrandEnum('dealer_brand'),
    dealerCode: text('dealer_code'),
    loginId: text('login_id'),
  },
  (table) => [
    index('idx_user_roles_role_brand').using(
      'btree',
      table.role.asc().nullsLast().op('enum_ops'),
      table.dealerBrand.asc().nullsLast().op('enum_ops'),
    ),
    uniqueIndex('uq_user_roles_login_id')
      .using('btree', table.loginId.asc().nullsLast().op('text_ops'))
      .where(sql`(login_id IS NOT NULL)`),
    check(
      'user_roles_dealer_required_check',
      sql`((role = 'dealer'::app_role) AND (dealer_brand IS NOT NULL) AND (COALESCE(dealer_code, ''::text) <> ''::text)) OR ((role <> 'dealer'::app_role) AND (dealer_brand IS NULL))`,
    ),
  ],
)

export const dealerInviteCodes = pgTable(
  'dealer_invite_codes',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    role: appRoleEnum('role').notNull(),
    dealerBrand: dealerBrandEnum('dealer_brand'),
    dealerCode: text('dealer_code'),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: uuid('used_by_user_id'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_dealer_invite_codes_code_hash').using(
      'btree',
      table.codeHash.asc().nullsLast().op('text_ops'),
    ),
    index('idx_dealer_invite_codes_status').using(
      'btree',
      table.dealerBrand.asc().nullsLast().op('enum_ops'),
      table.dealerCode.asc().nullsLast().op('text_ops'),
      table.usedAt.asc().nullsLast().op('timestamptz_ops'),
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    check(
      'dealer_invite_codes_dealer_scope_check',
      sql`("role" = 'dealer'::app_role AND "dealer_brand" IS NOT NULL) OR ("role" <> 'dealer'::app_role)`,
    ),
  ],
)
