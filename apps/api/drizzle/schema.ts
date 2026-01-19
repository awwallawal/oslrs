import { pgTable, foreignKey, unique, uuid, text, date, timestamp, integer, jsonb, serial, bigint } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"



export const users = pgTable("users", {
	id: uuid("id").primaryKey().notNull(),
	email: text("email").notNull(),
	phone: text("phone"),
	full_name: text("full_name").notNull(),
	password_hash: text("password_hash"),
	nin: text("nin"),
	date_of_birth: date("date_of_birth"),
	home_address: text("home_address"),
	bank_name: text("bank_name"),
	account_number: text("account_number"),
	account_name: text("account_name"),
	next_of_kin_name: text("next_of_kin_name"),
	next_of_kin_phone: text("next_of_kin_phone"),
	live_selfie_original_url: text("live_selfie_original_url"),
	live_selfie_id_card_url: text("live_selfie_id_card_url"),
	liveness_score: text("liveness_score"),
	live_selfie_verified_at: timestamp("live_selfie_verified_at", { withTimezone: true, mode: 'string' }),
	role_id: uuid("role_id").notNull().references(() => roles.id),
	lga_id: uuid("lga_id").references(() => lgas.id),
	status: text("status").default('invited').notNull(),
	invitation_token: text("invitation_token"),
	invited_at: timestamp("invited_at", { withTimezone: true, mode: 'string' }),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	last_login_at: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	current_session_id: uuid("current_session_id"),
	password_reset_token: text("password_reset_token"),
	password_reset_expires_at: timestamp("password_reset_expires_at", { withTimezone: true, mode: 'string' }),
	failed_login_attempts: integer("failed_login_attempts").default(0),
	locked_until: timestamp("locked_until", { withTimezone: true, mode: 'string' }),
},
(table) => {
	return {
		users_email_unique: unique("users_email_unique").on(table.email),
		users_phone_unique: unique("users_phone_unique").on(table.phone),
		users_nin_unique: unique("users_nin_unique").on(table.nin),
		users_invitation_token_unique: unique("users_invitation_token_unique").on(table.invitation_token),
		users_password_reset_token_unique: unique("users_password_reset_token_unique").on(table.password_reset_token),
	}
});

export const roles = pgTable("roles", {
	id: uuid("id").primaryKey().notNull(),
	name: text("name").notNull(),
	description: text("description"),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		roles_name_unique: unique("roles_name_unique").on(table.name),
	}
});

export const lgas = pgTable("lgas", {
	id: uuid("id").primaryKey().notNull(),
	name: text("name").notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		lgas_name_unique: unique("lgas_name_unique").on(table.name),
	}
});

export const audit_logs = pgTable("audit_logs", {
	id: uuid("id").primaryKey().notNull(),
	actor_id: uuid("actor_id").references(() => users.id),
	action: text("action").notNull(),
	target_resource: text("target_resource"),
	target_id: uuid("target_id"),
	details: jsonb("details"),
	ip_address: text("ip_address"),
	user_agent: text("user_agent"),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const __drizzle_migrations = pgTable("__drizzle_migrations", {
	id: serial("id").primaryKey().notNull(),
	hash: text("hash").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	created_at: bigint("created_at", { mode: "number" }).notNull(),
});