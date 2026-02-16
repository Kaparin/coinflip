/**
 * Sync vault balances from chain to local DB via API.
 * Queries on-chain balances and updates DB through vault service.
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

const API = 'http://localhost:3001';
const REST = process.env.AXIOME_REST_URL!;
const CONTRACT = process.env.COINFLIP_CONTRACT_ADDR!;

const players = [
  { name: 'Yang', address: 'axm1djudvj9cdyt96t6a0ayqq0d75k8xztvkcm30xq' },
  { name: 'Tera', address: 'axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud' },
];

async function getChainBalance(address: string): Promise<{ available: string; locked: string }> {
  const query = btoa(JSON.stringify({ vault_balance: { address } }));
  const res = await fetch(
    `${REST}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${query}`
  );
  const data = await res.json() as { data: { available: string; locked: string } };
  return data.data;
}

async function main() {
  console.log('Syncing vault balances from chain to DB...\n');

  for (const player of players) {
    // 1. Make sure user exists
    await fetch(`${API}/api/v1/auth/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: player.address }),
    });

    // 2. Get chain balance
    const chainBalance = await getChainBalance(player.address);
    console.log(`[${player.name}] Chain: available=${chainBalance.available}, locked=${chainBalance.locked}`);

    // 3. Get current DB balance
    const dbRes = await fetch(`${API}/api/v1/vault/balance`, {
      headers: { 'x-wallet-address': player.address },
    });
    const dbData = await dbRes.json() as { data: { available: string; locked: string } };
    console.log(`[${player.name}] DB:    available=${dbData.data.available}, locked=${dbData.data.locked}`);

    // 4. If mismatch, update DB directly via a small endpoint or DB call
    if (dbData.data.available !== chainBalance.available || dbData.data.locked !== chainBalance.locked) {
      console.log(`[${player.name}] Mismatch detected, updating DB...`);

      // We'll use the postgres driver directly to update
      const pg = await import('postgres');
      const sql = pg.default(process.env.DATABASE_URL!);

      // Get user id
      const [user] = await sql`SELECT id FROM users WHERE address = ${player.address}`;
      if (user) {
        await sql`
          INSERT INTO vault_balances (user_id, available, locked)
          VALUES (${user.id}, ${chainBalance.available}, ${chainBalance.locked})
          ON CONFLICT (user_id) DO UPDATE SET
            available = ${chainBalance.available},
            locked = ${chainBalance.locked},
            updated_at = NOW()
        `;
        console.log(`[${player.name}] Updated!`);
      }
      await sql.end();
    } else {
      console.log(`[${player.name}] Already in sync.`);
    }
    console.log();
  }

  console.log('Done!');
}

main().catch(console.error);
