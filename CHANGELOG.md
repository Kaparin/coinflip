# CoinFlip PvP — Changelog & Platform Guide

---

## v2.4.0 — Admin Panel Overhaul + News Feed (Feb 2026)

### Platform Configuration System
- **Dynamic config**: All game parameters (bet limits, TTL, presets, commission rates) are now configurable from the admin panel without code changes
- **Categories**: Game Settings, Display, Commission, Sponsored Announcements, Maintenance, General
- **Human-readable values**: LAUNCH token amounts displayed in whole units (e.g. "100 LAUNCH" instead of "100000000")
- **Maintenance mode**: One-click toggle to put the platform in maintenance — users see 503 with custom message

### Commission Distribution Control
- **Visual breakdown**: Color-coded bar showing commission split (Referrals / Jackpot / Partners / Treasury)
- **Editable referral levels**: Adjust Level 1, 2, 3 BPS and max cap from the admin panel
- **Partner Treasury**: Add revenue-sharing partners with custom BPS, track their earnings
- **Validation**: System prevents over-allocation (total cannot exceed commission BPS)

### News Feed (`/game/news`)
- **Public page**: Aggregated feed of platform updates, announcements, big wins, and jackpot wins
- **Filter chips**: All / Updates / Announcements / Big Wins / Jackpots
- **Infinite scroll**: Cursor-based pagination with "Load more"
- **Mobile-first**: Icon-only filters on mobile, compact card layouts
- **Admin CRUD**: Create, edit, publish/unpublish, delete news posts from admin panel

### Sponsored Announcements
- **Player-submitted**: Anyone can pay LAUNCH to submit an announcement for review
- **Review flow**: Admin sees pending requests, can preview full message, approve or reject
- **Refund on reject**: Full amount returned to player's available balance
- **Success screen**: Player sees clear explanation of what happens next after submitting

### Admin Panel UX
- **Compact tab navigation**: Icon-only on mobile, icon+text on desktop (13 tabs without overflow)
- **Config with human labels**: "Min Bet (LAUNCH)" instead of "MIN_BET_AMOUNT"
- **Pending review badge**: Sponsored announcements awaiting approval shown at top

---

## v2.3.0 — VIP Subscription System (Feb 2026)

### VIP Tiers
- **Silver / Gold / Diamond**: Three subscription tiers with increasing benefits
- **Bet boost**: VIP players get bonus multiplier on wins
- **Pin discount**: Reduced pin prices for VIP members
- **Admin management**: Grant/revoke VIP, configure pricing, view subscriber stats

---

## v2.2.0 — Jackpot System (Feb 2026)

### Progressive Jackpots
- **5 tiers**: Mini, Minor, Major, Mega, Grand — each with its own pool
- **Auto-contribution**: Percentage of every bet commission feeds the jackpot pools
- **Random draw**: When pool reaches target + minimum games, winner is drawn randomly weighted by contribution
- **Jackpot page**: Visual progress bars, pool amounts, contribution history
- **Admin controls**: Force draw, reset pool, adjust tier targets

---

## v2.1.0 — Notifications + Activity History (Feb 2026)

### Notification System
- **In-app notifications**: Announcements, big wins, system messages
- **WebSocket real-time delivery**: Instant push via WS connection
- **Announcement modal**: Full-screen announcement display with priority badges

### Activity Feed
- **Unified history**: All user activity (bets, wins, deposits, withdrawals) in one feed
- **Cursor-based pagination**: Infinite scroll with efficient DB queries

---

## v2.0.0 — Core Game Features (Jan-Feb 2026)

### PvP Coin Flip
- **Heads or Tails**: Two players wager LAUNCH tokens, winner takes 2x minus 10% commission
- **Commit-reveal**: Cryptographic fairness — maker commits secret side, revealed after match
- **1-Click Play**: Cosmos x/authz delegation for instant betting without manual TX signing
- **Gas sponsorship**: Platform covers gas fees via x/feegrant

### Player Profiles
- **Stats**: Win rate, total volume, win streak, favorite side
- **16 Achievements**: Unlocked based on play history (wins, streaks, volume, profitability)
- **8 Reactions**: Other players can react to profiles with emojis
- **Head-to-head**: Compare stats with any other player

### Referral System
- **3-level deep**: Level 1 (3%), Level 2 (1.5%), Level 3 (0.5%) of commission
- **Branch change**: Switch referrer for 1,000 LAUNCH
- **Configurable**: All referral rates adjustable from admin panel

### Leaderboard
- **Sort by**: Wins, volume, win rate
- **Clickable avatars**: Navigate to player profiles
- **Top winner banner**: Golden banner showing biggest single payout

### Events System
- **Contests**: Auto-participation based on play
- **Raffles**: Manual join with entry fee
- **Admin management**: Create, edit, draw winners

### Pinned Bets
- **Pin slots**: Configurable number of premium bet display slots
- **Outbid system**: Higher bid displaces current pin, 50% refund if expired

---

# Platform Feature Guide

## For Players

### How to Play
1. **Connect wallet** — Link your Cosmos wallet to the platform
2. **Enable 1-Click Play** — Delegate signing authority for instant bets (scoped to CoinFlip contract only)
3. **Create a bet** — Choose Heads or Tails, set your wager amount
4. **Wait for match** — Another player accepts your bet with the opposite side
5. **Automatic reveal** — The platform reveals the result and pays the winner

### Winning
- Winner receives **2x the bet amount minus 10% commission**
- Commission is distributed: referrals (up to 5%), jackpot (1%), partners, treasury

### Your Profile
- View your **stats, achievements, and win streak** at your profile page
- Other players can see your profile by clicking your avatar anywhere on the platform
- **16 achievements** to unlock based on your play history

### Referral Program
- Share your referral link to earn commission on your referrals' bets
- **3 levels deep** — earn from your referrals' referrals too
- Rates are configurable by the platform (default: 3% / 1.5% / 0.5%)

### VIP Benefits
- Subscribe to **Silver, Gold, or Diamond** tier
- Get **bet boosts** and **pin discounts**
- VIP status visible on your profile

### Jackpots
- Every bet contributes to **5 progressive jackpot pools**
- When a pool reaches its target, a random winner is drawn
- Bigger bets = higher chance of winning

### Sponsored Announcements
- Pay LAUNCH to submit an announcement visible to all players
- Your announcement is reviewed by admins before publishing
- **Full refund** if your announcement is rejected

### News Feed
- Check `/game/news` for platform updates, big wins, jackpot wins
- Filter by type: Updates, Announcements, Big Wins, Jackpots

## For Admins

### Dashboard
- Platform stats: total bets, volume, users, active bets
- Treasury balance and withdrawal

### Configuration
- All game parameters adjustable without code deployment
- Values shown in human-readable LAUNCH amounts
- Maintenance mode toggle

### Commission Management
- Visual commission breakdown
- Editable referral rates
- Partner treasury with per-partner BPS tracking

### Content Management
- **News posts**: Create platform updates and announcements
- **Sponsored review**: Approve or reject player-submitted announcements
- **Announcement broadcast**: Send instant notifications to all users

### Diagnostics
- Stuck bets detection
- Missing secrets recovery
- Orphaned bets import
- One-click heal system

---

# Ready-to-Publish Texts

## Welcome Post (News)

**Title:** Welcome to CoinFlip PvP!

**Content:**
Welcome to CoinFlip — the first PvP coin flip game on Axiome Chain!

Flip a coin against real players, bet LAUNCH tokens, and win 2x your stake. Every game is cryptographically fair thanks to our commit-reveal system.

What we offer:
• PvP coin flip with instant 1-Click Play
• Progressive jackpots — 5 tiers, growing with every bet
• Referral program — earn up to 5% from your referrals' bets
• VIP subscriptions with bet boosts
• Player profiles with 16 achievements to unlock
• Leaderboards, events, and contests

Your funds are secured by smart contracts on Axiome Chain. We never hold your tokens — everything goes through the on-chain vault.

Good luck and may the coin be in your favor!

---

## v2.4.0 Update Post (News)

**Title:** Platform Update v2.4.0 — News Feed, Sponsored Announcements & More

**Content:**
We're excited to announce a major platform update!

What's new:

📰 News Feed
A new page where you can see all platform updates, big wins, jackpot draws, and community announcements in one place. Filter by type and never miss an important update.

📢 Sponsored Announcements
Want to share something with the community? You can now submit a paid announcement that will be shown to all players after admin review. If your announcement is rejected, you get a full refund.

⚙️ Platform Configuration
All game settings are now fully dynamic — bet limits, commission rates, and more can be adjusted in real-time without downtime.

💰 Commission Transparency
Commission distribution (referrals, jackpots, partners, treasury) is now fully configurable and visible in the admin panel.

🛡️ Maintenance Mode
We can now put the platform into maintenance mode when needed, showing a clear message to all users.

Thank you for being part of CoinFlip!

---

## v2.3.0 Update Post (News)

**Title:** VIP Subscriptions Are Here! v2.3.0

**Content:**
Introducing VIP subscriptions — three tiers of premium benefits!

🥈 Silver — Entry-level boost for regular players
🥇 Gold — Enhanced rewards and pin discounts
💎 Diamond — Maximum boost and exclusive perks

VIP members get bet boosts on every win and reduced pin prices. Subscribe from your profile page and start earning more today!

---

## v2.2.0 Update Post (News)

**Title:** Progressive Jackpots Launched! v2.2.0

**Content:**
Five progressive jackpot pools are now live!

Every bet you place contributes to the jackpot pools. When a pool reaches its target, one lucky player wins the entire pot! The bigger your bets, the higher your chances.

Tiers: Mini → Minor → Major → Mega → Grand

Check the Jackpot page to see current pool sizes and your contribution history. Will you be the next jackpot winner?

---

## Platform Rules Post (News)

**Title:** How CoinFlip Works — Rules & FAQ

**Content:**
How to play:
1. Connect your wallet and enable 1-Click Play
2. Create a bet — choose Heads or Tails and your wager
3. Wait for another player to accept
4. Result is revealed automatically — winner gets 2x minus 10% commission

Fairness:
Every game uses commit-reveal cryptography. The maker's choice is locked in a hash before the game starts. Neither the platform nor the opponent can cheat.

Commission (10% of pot):
• Referral rewards (up to 5%)
• Jackpot contributions (1%)
• Partner revenue sharing
• Platform treasury

Your funds:
All tokens are held in an on-chain smart contract vault. The platform never has custody of your funds outside of active bets.

Limits:
• Minimum bet: configurable (check game settings)
• Maximum daily volume: configurable
• Maximum open bets: 255 per user

Need help? Reach out to the community or check the news feed for updates!
