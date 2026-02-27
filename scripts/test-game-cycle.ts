/**
 * Full game cycle test: Create Bet → Accept Bet → Reveal → Check winner.
 * Tests the entire API + Chain pipeline.
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

const API = 'http://localhost:3001';

const YANG = 'axm1djudvj9cdyt96t6a0ayqq0d75k8xztvkcm30xq';
const TERA = 'axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud';

async function apiCall(path: string, method: string, address: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': address,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`  FAIL ${method} ${path}: ${res.status}`, JSON.stringify(json, null, 2));
    return null;
  }
  return json;
}

import { createHash, randomBytes } from 'node:crypto';

function sha256hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

async function main() {
  console.log('=== CoinFlip Full Game Cycle Test ===\n');

  // Step 1: Check vault balances
  console.log('--- Step 1: Check vault balances ---');
  const yangBalance = await apiCall('/api/v1/vault/balance', 'GET', YANG);
  console.log(`  Yang: ${yangBalance?.data?.available ?? '?'} COIN available`);
  const teraBalance = await apiCall('/api/v1/vault/balance', 'GET', TERA);
  console.log(`  Tera: ${teraBalance?.data?.available ?? '?'} COIN available`);

  if (BigInt(yangBalance?.data?.available ?? 0) < 100n) {
    console.error('  Yang has insufficient balance!');
    return;
  }

  // Step 2: Yang creates a bet (Heads, 10,000,000 COIN)
  console.log('\n--- Step 2: Yang creates bet (10000000 COIN, Heads) ---');
  const secret = generateSecret(); // 64 hex chars (32 bytes)
  const side = 'heads';
  // Commitment = SHA256("coinflip_v1" || maker_address || side || secret_bytes)
  const preimage = Buffer.concat([
    Buffer.from('coinflip_v1'),
    Buffer.from(YANG),
    Buffer.from(side),
    Buffer.from(secret, 'hex'),
  ]);
  const commitment = sha256hex(preimage);
  console.log(`  Commitment: ${commitment.slice(0, 16)}...`);
  console.log(`  Secret: ${secret.slice(0, 16)}...`);

  const createResult = await apiCall('/api/v1/bets', 'POST', YANG, {
    amount: '10000000',
    commitment,
  });

  if (!createResult) {
    console.error('  Failed to create bet!');
    return;
  }
  console.log(`  Bet created: id=${createResult.data?.id}, tx_hash=${createResult.tx_hash ?? 'N/A'}`);
  const betId = createResult.data?.id;

  // Step 3: Check open bets
  console.log('\n--- Step 3: Check open bets ---');
  const openBets = await apiCall('/api/v1/bets?status=open', 'GET', YANG);
  console.log(`  Open bets: ${openBets?.data?.length ?? 0}`);

  // Step 4: Tera accepts the bet (Tails)
  console.log('\n--- Step 4: Tera accepts bet (Tails) ---');
  const acceptResult = await apiCall(`/api/v1/bets/${betId}/accept`, 'POST', TERA, {
    guess: 'tails',
  });
  if (!acceptResult) {
    console.error('  Failed to accept bet!');
    // Try cancel instead
    console.log('  Attempting to cancel...');
    const cancelResult = await apiCall(`/api/v1/bets/${betId}/cancel`, 'POST', YANG);
    console.log('  Cancel:', cancelResult ? 'OK' : 'FAIL');
    return;
  }
  console.log(`  Accepted! tx_hash=${acceptResult.tx_hash ?? 'N/A'}`);

  // Step 5: Yang reveals
  console.log('\n--- Step 5: Yang reveals ---');
  const revealResult = await apiCall(`/api/v1/bets/${betId}/reveal`, 'POST', YANG, {
    side,
    secret,
  });
  if (!revealResult) {
    console.error('  Failed to reveal!');
    return;
  }
  console.log(`  Revealed! tx_hash=${revealResult.tx_hash ?? 'N/A'}, status=${revealResult.status ?? 'N/A'}`);

  // Step 6: Check final balances
  console.log('\n--- Step 6: Final balances ---');
  await new Promise(r => setTimeout(r, 2000)); // wait for indexer
  const yangFinal = await apiCall('/api/v1/vault/balance', 'GET', YANG);
  console.log(`  Yang: ${yangFinal?.data?.available ?? '?'} COIN available`);
  const teraFinal = await apiCall('/api/v1/vault/balance', 'GET', TERA);
  console.log(`  Tera: ${teraFinal?.data?.available ?? '?'} COIN available`);

  // Step 7: Check bet details
  console.log('\n--- Step 7: Bet details ---');
  const betDetails = await apiCall(`/api/v1/bets/${betId}`, 'GET', YANG);
  console.log(`  Status: ${betDetails?.data?.status ?? '?'}`);
  console.log(`  Winner: ${betDetails?.data?.winner ?? '?'}`);
  console.log(`  Payout: ${betDetails?.data?.payout_amount ?? '?'}`);

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
