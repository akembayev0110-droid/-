import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const arena = sqliteTable('arena',{id:integer('id').primaryKey(),version:integer('version').notNull(),data:text('data').notNull()});
export const results = sqliteTable('results',{id:text('id').primaryKey(),winner:text('winner'),loser:text('loser'),finished:integer('finished').notNull()},t=>[index('results_winner_idx').on(t.winner),index('results_loser_idx').on(t.loser)]);
