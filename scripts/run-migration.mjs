/**
 * Applies production audit migration to Neon database via HTTP API.
 * Usage: node scripts/run-migration.mjs
 */
import { neon } from '@neondatabase/serverless';

// Use unpooled endpoint for DDL operations
const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://neondb_owner:npg_n8uK1sXBTmYS@ep-odd-surf-aia8mumo.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL, { fullResults: false });

async function run() {
  console.log('Connecting to Neon via HTTP API...');
  console.log('Endpoint:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

  // Test connection
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  console.log('Connected. Tables:', tables.map(t => t.tablename).join(', '));

  // 1. Check for duplicate referral rewards
  console.log('\n--- Step 1: Checking for duplicate referral rewards ---');
  const dupes = await sql`
    SELECT bet_id, recipient_user_id, level, COUNT(*) as cnt
    FROM referral_rewards
    GROUP BY bet_id, recipient_user_id, level
    HAVING COUNT(*) > 1
  `;

  if (dupes.length > 0) {
    console.log(`Found ${dupes.length} duplicate groups. Deduplicating...`);
    await sql`
      DELETE FROM referral_rewards a
      USING referral_rewards b
      WHERE a.id > b.id
        AND a.bet_id = b.bet_id
        AND a.recipient_user_id = b.recipient_user_id
        AND a.level = b.level
    `;
    console.log('Deduplicated.');
  } else {
    console.log('No duplicates found.');
  }

  // 2. Add unique constraint
  console.log('\n--- Step 2: Adding unique constraint on referral_rewards ---');
  try {
    await sql`
      ALTER TABLE referral_rewards
      ADD CONSTRAINT ref_rewards_bet_recipient_level_uniq
      UNIQUE (bet_id, recipient_user_id, level)
    `;
    console.log('OK: unique constraint added.');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('SKIP: constraint already exists.');
    } else {
      throw e;
    }
  }

  // 3. Create indexes on bets
  console.log('\n--- Step 3: Creating indexes on bets ---');

  try { await sql`CREATE INDEX IF NOT EXISTS bets_status_created_idx ON bets (status, created_time)`; console.log('OK: bets_status_created_idx'); } catch (e) { console.log(`SKIP: bets_status_created_idx — ${e.message}`); }
  try { await sql`CREATE INDEX IF NOT EXISTS bets_maker_status_idx ON bets (maker_user_id, status)`; console.log('OK: bets_maker_status_idx'); } catch (e) { console.log(`SKIP: bets_maker_status_idx — ${e.message}`); }
  try { await sql`CREATE INDEX IF NOT EXISTS bets_acceptor_status_idx ON bets (acceptor_user_id, status)`; console.log('OK: bets_acceptor_status_idx'); } catch (e) { console.log(`SKIP: bets_acceptor_status_idx — ${e.message}`); }
  try { await sql`CREATE INDEX IF NOT EXISTS bets_status_resolved_idx ON bets (status, resolved_time)`; console.log('OK: bets_status_resolved_idx'); } catch (e) { console.log(`SKIP: bets_status_resolved_idx — ${e.message}`); }
  try { await sql`CREATE INDEX IF NOT EXISTS bets_txhash_create_idx ON bets (txhash_create)`; console.log('OK: bets_txhash_create_idx'); } catch (e) { console.log(`SKIP: bets_txhash_create_idx — ${e.message}`); }
  try { await sql`CREATE INDEX IF NOT EXISTS bets_txhash_accept_idx ON bets (txhash_accept)`; console.log('OK: bets_txhash_accept_idx'); } catch (e) { console.log(`SKIP: bets_txhash_accept_idx — ${e.message}`); }
  try { await sql`CREATE INDEX IF NOT EXISTS bets_commitment_idx ON bets (commitment)`; console.log('OK: bets_commitment_idx'); } catch (e) { console.log(`SKIP: bets_commitment_idx — ${e.message}`); }

  // 4. Create index on tx_events
  console.log('\n--- Step 4: Creating index on tx_events ---');
  try { await sql`CREATE INDEX IF NOT EXISTS tx_events_txhash_type_idx ON tx_events (txhash, event_type)`; console.log('OK: tx_events_txhash_type_idx'); } catch (e) { console.log(`SKIP: ${e.message}`); }

  // 5. Verify
  console.log('\n--- Verification ---');
  const allIndexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND (indexname LIKE 'bets_%' OR indexname LIKE 'tx_events_%' OR indexname LIKE 'ref_rewards_%')
    ORDER BY indexname
  `;
  console.log('Indexes:\n  ' + allIndexes.map(i => i.indexname).join('\n  '));

  console.log('\nDone! Migration applied successfully.');
}

run().catch(async (err) => {
  console.error('Migration failed:', err.message);
  if (err.cause) console.error('Cause:', err.cause);
  console.error('Stack:', err.stack);
  process.exit(1);
});
