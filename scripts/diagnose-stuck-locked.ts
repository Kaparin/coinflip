/**
 * Diagnose stuck locked funds for a user.
 *
 * Usage: pnpm exec tsx scripts/diagnose-stuck-locked.ts [address]
 *
 * Example: pnpm exec tsx scripts/diagnose-stuck-locked.ts axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud
 *
 * This script:
 * 1. Queries chain vault_balance for the address
 * 2. Queries chain user_bets (all bets where user is maker or acceptor)
 * 3. Queries DB for user and their bets
 * 4. Identifies mismatches and suggests fixes
 */

import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

const REST = process.env.AXIOME_REST_URL!;
const CONTRACT = process.env.COINFLIP_CONTRACT_ADDR!;
const DATABASE_URL = process.env.DATABASE_URL!;

const ADDRESS = process.argv[2] ?? 'axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud';

async function queryChain<T>(query: object): Promise<T> {
  const encoded = Buffer.from(JSON.stringify(query)).toString('base64');
  const res = await fetch(
    `${REST}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${encoded}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`Chain query failed: ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

function fromMicroLaunch(micro: string): string {
  const n = BigInt(micro);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(6, '0')}`;
}

async function main() {
  console.log('=== Stuck Locked Funds Diagnostic ===\n');
  console.log(`Address: ${ADDRESS}\n`);

  // 1. Chain vault balance
  const chainBalance = await queryChain<{ available: string; locked: string }>({
    vault_balance: { address: ADDRESS },
  });
  console.log('1. CHAIN vault_balance:');
  console.log(`   available: ${chainBalance.available} (${fromMicroLaunch(chainBalance.available)} COIN)`);
  console.log(`   locked:    ${chainBalance.locked} (${fromMicroLaunch(chainBalance.locked)} COIN)\n`);

  // 2. Chain user_bets (all bets where user is maker or acceptor)
  const chainUserBets = await queryChain<{ bets: Array<{
    id: number;
    maker: string;
    acceptor: string | null;
    amount: string;
    status: string;
    commitment: string;
    created_at_time: number;
    accepted_at_time: number | null;
  }> }>({ user_bets: { address: ADDRESS, limit: 50 } });

  console.log('2. CHAIN user_bets (bets where user is maker or acceptor):');
  if (chainUserBets.bets.length === 0) {
    console.log('   (none)\n');
  } else {
    for (const b of chainUserBets.bets) {
      const role = b.maker === ADDRESS ? 'maker' : 'acceptor';
      const created = new Date(b.created_at_time > 1e12 ? b.created_at_time : b.created_at_time * 1000).toISOString();
      console.log(`   - Bet #${b.id}: ${fromMicroLaunch(b.amount)} COIN, status=${b.status}, role=${role}, created=${created}`);
    }
    console.log();
  }

  // 3. DB: user + vault_balances + bets
  const pg = await import('postgres');
  const sql = pg.default(DATABASE_URL);

  const [user] = await sql`
    SELECT id, address, profile_nickname, created_at
    FROM users
    WHERE address = ${ADDRESS.toLowerCase()}
  `;

  if (!user) {
    console.log('3. DB: User NOT FOUND for this address.\n');
    console.log('   → User may need to connect wallet first to be created.');
    await sql.end();
    return;
  }

  console.log('3. DB user:');
  console.log(`   id: ${user.id}`);
  console.log(`   address: ${user.address}`);
  console.log(`   nickname: ${user.profile_nickname ?? '(none)'}`);
  console.log(`   created_at: ${user.created_at}\n`);

  const [vb] = await sql`
    SELECT available, locked, updated_at
    FROM vault_balances
    WHERE user_id = ${user.id}
  `;

  console.log('4. DB vault_balances:');
  if (!vb) {
    console.log('   (no row — user has no vault_balances record)\n');
  } else {
    console.log(`   available: ${vb.available} (${fromMicroLaunch(vb.available)} COIN)`);
    console.log(`   locked:    ${vb.locked} (${fromMicroLaunch(vb.locked)} COIN)`);
    console.log(`   updated_at: ${vb.updated_at}\n`);
  }

  const dbBets = await sql`
    SELECT bet_id, amount, status, maker_user_id, acceptor_user_id,
           created_time, accepted_time, resolved_time,
           txhash_create, txhash_accept, txhash_resolve
    FROM bets
    WHERE maker_user_id = ${user.id} OR acceptor_user_id = ${user.id}
    ORDER BY created_time DESC
    LIMIT 20
  `;

  console.log('5. DB bets (user as maker or acceptor):');
  if (dbBets.length === 0) {
    console.log('   (none)\n');
  } else {
    for (const b of dbBets) {
      const role = b.maker_user_id === user.id ? 'maker' : 'acceptor';
      console.log(`   - Bet #${b.bet_id}: ${fromMicroLaunch(b.amount)} COIN, status=${b.status}, role=${role}`);
      console.log(`     created=${b.created_time}, accepted=${b.accepted_time ?? '-'}, resolved=${b.resolved_time ?? '-'}`);
    }
    console.log();
  }

  // 6. Analysis
  console.log('=== ANALYSIS ===\n');

  const chainLocked = BigInt(chainBalance.locked);
  const dbLocked = vb ? BigInt(vb.locked) : 0n;

  if (chainLocked > 0n && chainUserBets.bets.length === 0) {
    console.log('⚠️  Chain has locked funds but user_bets returns empty!');
    console.log('   This may indicate a contract bug or the bet was resolved but vault not updated.');
    console.log('   Check contract state manually.\n');
  }

  if (chainLocked > 0n && chainUserBets.bets.length > 0) {
    const activeChainBets = chainUserBets.bets.filter(b =>
      ['open', 'accepted'].includes(b.status.toLowerCase()),
    );
    console.log(`Chain has ${fromMicroLaunch(chainBalance.locked)} COIN locked.`);
    console.log(`Active bets on chain: ${activeChainBets.length}`);
    for (const b of activeChainBets) {
      console.log(`\n   Bet #${b.id} (${b.status}):`);
      console.log(`   - Amount: ${fromMicroLaunch(b.amount)} COIN`);
      console.log(`   - Maker: ${b.maker}`);
      console.log(`   - Acceptor: ${b.acceptor ?? '(none)'}`);
      const role = b.maker === ADDRESS ? 'maker' : 'acceptor';
      console.log(`   - Your role: ${role}`);

      if (b.status.toLowerCase() === 'open') {
        if (role === 'maker') {
          console.log(`   → FIX: User can cancel this bet from the UI, or admin can force-cancel.`);
        } else {
          console.log(`   → (You are acceptor — bet is open, maker hasn\'t been matched)`);
        }
      } else if (b.status.toLowerCase() === 'accepted') {
        const acceptedAt = b.accepted_at_time ? new Date(b.accepted_at_time > 1e12 ? b.accepted_at_time : b.accepted_at_time * 1000) : null;
        console.log(`   - Accepted at: ${acceptedAt?.toISOString() ?? '?'}`);
        if (role === 'maker') {
          console.log(`   → FIX: Maker needs to reveal (or wait for timeout). Check if maker_secret exists in DB.`);
        } else {
          console.log(`   → FIX: If past reveal timeout (~5 min), acceptor can claim_timeout from UI.`);
        }
      }
    }
    console.log();
  }

  if (chainLocked !== dbLocked) {
    console.log(`⚠️  Chain/DB mismatch: chain locked=${fromMicroLaunch(chainBalance.locked)}, DB locked=${fromMicroLaunch(dbLocked.toString())}`);
    console.log('   Run: pnpm exec tsx scripts/sync-balances.ts to sync DB from chain.');
    console.log('   Note: Balance API uses CHAIN as source — UI shows chain. DB is for admin/cache.\n');
  }

  if (chainLocked > 0n && dbBets.length === 0) {
    console.log('⚠️  Chain has locked funds but DB has no bets for this user.');
    console.log('   The bet may be orphaned (on chain but not in DB).');
    console.log('   The reconcileOrphanedChainBets sweep should import it — ensure ENABLE_BACKGROUND_SWEEP=true.');
    console.log('   Or the bet may belong to a different user (check maker/acceptor on chain).\n');
  }

  console.log('=== UNLOCK OPTIONS ===\n');
  console.log('1. If bet exists in DB: use Admin → Actions → Force Cancel (for open bets)');
  console.log('2. If bet is accepted and past timeout: user can Claim Timeout from UI');
  console.log('3. If bet is orphaned: background sweep will import it; then user can cancel');
  console.log('4. Admin unlock-funds only updates DB — it does NOT change the chain!');
  console.log('   The chain is the source of truth. To free funds on chain, the bet must be');
  console.log('   resolved (cancel_bet, reveal, or claim_timeout).\n');

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
