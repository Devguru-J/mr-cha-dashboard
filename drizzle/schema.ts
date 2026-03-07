import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  bigserial,
} from 'drizzle-orm/pg-core'

export const appRoleEnum = pgEnum('app_role', ['super', 'manager', 'dealer'])

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').primaryKey(),
  role: appRoleEnum('role').notNull(),
  dealerScope: text('dealer_scope').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dealerDiscounts = pgTable('dealer_discounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey(),
  sourceFileName: text('source_file_name').notNull(),
  snapshotMonth: date('snapshot_month').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const residualValues = pgTable('residual_values', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
