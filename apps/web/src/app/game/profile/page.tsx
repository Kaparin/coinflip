'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useWalletContext } from '@/contexts/wallet-context';
import { ADMIN_ADDRESS, EXPLORER_URL, COINFLIP_CONTRACT, LAUNCH_CW20_CONTRACT } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';
import { useReferral } from '@/hooks/use-referral';
import { formatLaunch } from '@coinflip/shared/constants';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  variant = 'default',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'danger';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const borderClass = variant === 'danger'
    ? 'border-[var(--color-danger)]/20'
    : 'border-[var(--color-border)]';

  return (
    <div className={`rounded-2xl border ${borderClass} bg-[var(--color-surface)] overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        <span className="text-[var(--color-text-secondary)]">{icon}</span>
        <span className="flex-1 text-sm font-bold">{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[var(--color-border)]/50">
          {children}
        </div>
      )}
    </div>
  );
}

function AboutSection() {
  const { t } = useTranslation();

  return (
    <div className="pt-4 space-y-5">
      <div>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <strong className="text-[var(--color-text)]">CoinFlip</strong> — {t('profile.aboutDesc')}
        </p>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
          {t('profile.howWinnerDetermined')}
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] mb-3">
          {t('profile.winnerExplanation')}
        </p>
        <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 overflow-x-auto">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)] mb-2">{t('profile.randomCodeTitle')}</p>
          <pre className="text-[11px] font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">{`${t('profile.randomCodeComment1')}
import { randomBytes } from 'node:crypto';

function secureCoinFlip() {
  const byte = randomBytes(1)[0]; // 0-255
  return byte % 2 === 0 ? 'heads' : 'tails';
}

${t('profile.randomCodeComment2')}
const makerSide = secureCoinFlip();   ${t('profile.randomCodeComment3')}
${t('profile.randomCodeComment4')}
const acceptorGuess = secureCoinFlip(); ${t('profile.randomCodeComment5')}

${t('profile.randomCodeComment6')}
${t('profile.randomCodeComment7')}`}</pre>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          <code className="text-[var(--color-primary)]">crypto.randomBytes</code> {t('profile.randomCodeExplanation')}
        </p>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
          {t('profile.commissionTitle')}
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t('profile.commissionDesc')}
        </p>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
          {t('profile.securityTitle')}
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t('profile.securityDesc')}
        </p>
      </div>

      {/* Contract Addresses */}
      {(COINFLIP_CONTRACT || LAUNCH_CW20_CONTRACT) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
            {t('profile.contractsTitle')}
          </p>
          <div className="space-y-2">
            {COINFLIP_CONTRACT && (
              <a
                href={`${EXPLORER_URL}/address/${COINFLIP_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 group"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('profile.gameContract')}</p>
                  <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                    {COINFLIP_CONTRACT}
                  </p>
                </div>
                <svg className="h-4 w-4 flex-shrink-0 text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            )}
            {LAUNCH_CW20_CONTRACT && (
              <a
                href={`${EXPLORER_URL}/address/${LAUNCH_CW20_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 group"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('profile.launchToken')}</p>
                  <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text)] group-hover:text-emerald-400 transition-colors">
                    {LAUNCH_CW20_CONTRACT}
                  </p>
                </div>
                <svg className="h-4 w-4 flex-shrink-0 text-[var(--color-text-secondary)] group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RulesSection() {
  const { t } = useTranslation();

  const steps = [
    {
      num: '1',
      title: t('profile.rulesStep1'),
      desc: t('profile.rulesStep1Desc'),
    },
    {
      num: '2',
      title: t('profile.rulesStep2'),
      desc: t('profile.rulesStep2Desc'),
    },
    {
      num: '3',
      title: t('profile.rulesStep3'),
      desc: t('profile.rulesStep3Desc'),
    },
    {
      num: '4',
      title: t('profile.rulesStep4'),
      desc: t('profile.rulesStep4Desc'),
    },
    {
      num: '5',
      title: t('profile.rulesStep5'),
      desc: t('profile.rulesStep5Desc'),
    },
  ];

  return (
    <div className="pt-4 space-y-5">
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.num} className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
              <span className="text-xs font-black text-[var(--color-primary)]">{step.num}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">{step.title}</p>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mt-0.5">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{t('profile.importantToKnow')}</p>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <span className="text-[var(--color-warning)] mt-0.5">*</span>
            <span>{t('profile.important1')}</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <span className="text-[var(--color-warning)] mt-0.5">*</span>
            <span>{t('profile.important2')}</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <span className="text-[var(--color-warning)] mt-0.5">*</span>
            <span>{t('profile.important3')}</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <span className="text-[var(--color-warning)] mt-0.5">*</span>
            <span>{t('profile.important4')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ReferralSection({ isConnected }: { isConnected: boolean }) {
  const { t } = useTranslation();
  const { code, stats, claiming, claim, shareUrl } = useReferral(isConnected);
  const [linkCopied, setLinkCopied] = useState(false);

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [shareUrl]);

  const handleShare = useCallback(() => {
    if (!shareUrl) return;
    if (navigator.share) {
      navigator.share({ text: `${t('referral.shareText')} ${shareUrl}` }).catch(() => {});
    } else {
      copyLink();
    }
  }, [shareUrl, t, copyLink]);

  const unclaimedAmount = stats?.balance?.unclaimed ? BigInt(stats.balance.unclaimed) : 0n;
  const totalEarnedAmount = stats?.balance?.totalEarned ? BigInt(stats.balance.totalEarned) : 0n;

  const LEVELS = [
    { level: 1, pct: '3%', commPct: '30%', color: 'from-violet-500 to-indigo-500', bgColor: 'bg-violet-500/10', textColor: 'text-violet-400', borderColor: 'border-violet-500/30' },
    { level: 2, pct: '1.5%', commPct: '15%', color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400', borderColor: 'border-blue-500/30' },
    { level: 3, pct: '0.5%', commPct: '5%', color: 'from-teal-500 to-emerald-500', bgColor: 'bg-teal-500/10', textColor: 'text-teal-400', borderColor: 'border-teal-500/30' },
  ];

  return (
    <div className="space-y-4">

      {/* How it works — steps */}
      <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
          {t('referral.howItWorks')}
        </p>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3">
          {t('referral.inviteDesc')}
        </p>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold flex items-center justify-center">
                {step}
              </span>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {t(`referral.step${step}` as 'referral.step1')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 3-Level reward structure — visual cards */}
      <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
          {t('referral.rewardStructure')}
        </p>
        <p className="text-[11px] text-[var(--color-text-secondary)] mb-3 leading-relaxed">
          {t('referral.rewardStructureDesc')}
        </p>

        {/* Visual tree */}
        <div className="relative space-y-2">
          {LEVELS.map(({ level, pct, commPct, color, bgColor, textColor, borderColor }) => (
            <div key={level} className={`relative rounded-xl border ${borderColor} ${bgColor} p-3`} style={{ marginLeft: `${(level - 1) * 12}px` }}>
              {level > 1 && (
                <div className="absolute -top-2 left-3 w-px h-2 bg-[var(--color-border)]" />
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                    <span className="text-xs font-extrabold text-white">L{level}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold">{t('referral.level', { level })}</p>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">
                      {t(`referral.levelWho${level}` as 'referral.levelWho1')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-extrabold ${textColor}`}>{pct}</p>
                  <p className="text-[9px] text-[var(--color-text-secondary)]">
                    {t('referral.ofPot')} ({commPct} {t('referral.ofCommission')})
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Platform keeps */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3" style={{ marginLeft: '0px' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-border)] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t('referral.platform')}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-[var(--color-text-secondary)]">5%</p>
                <p className="text-[9px] text-[var(--color-text-secondary)]">
                  {t('referral.ofPot')} (50% {t('referral.ofCommission')})
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Example calculation */}
        <div className="mt-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)] mb-2">
            {t('referral.example')}
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mb-2 leading-relaxed">
            {t('referral.exampleDesc')}
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--color-text-secondary)]">{t('referral.exampleWinner')}</span>
              <span className="font-bold">180 LAUNCH <span className="text-[var(--color-text-secondary)] font-normal">(90%)</span></span>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex justify-between text-[11px]">
              <span className="text-violet-400">{t('referral.exampleL1')}</span>
              <span className="font-bold text-violet-400">6 LAUNCH <span className="text-[var(--color-text-secondary)] font-normal">(3%)</span></span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-blue-400">{t('referral.exampleL2')}</span>
              <span className="font-bold text-blue-400">3 LAUNCH <span className="text-[var(--color-text-secondary)] font-normal">(1.5%)</span></span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-teal-400">{t('referral.exampleL3')}</span>
              <span className="font-bold text-teal-400">1 LAUNCH <span className="text-[var(--color-text-secondary)] font-normal">(0.5%)</span></span>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--color-text-secondary)]">{t('referral.platform')}</span>
              <span className="font-bold text-[var(--color-text-secondary)]">10 LAUNCH <span className="font-normal">(5%)</span></span>
            </div>
          </div>
        </div>

        {/* Important note */}
        <p className="mt-2 text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
          {t('referral.rewardNote')}
        </p>
      </div>

      {/* Referral link */}
      {code && shareUrl && (
        <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
            {t('referral.yourLink')}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] px-3 py-2">
              <p className="text-xs font-mono break-all text-[var(--color-text)]">{shareUrl}</p>
            </div>
            <button
              type="button" onClick={copyLink}
              className="flex-shrink-0 rounded-lg bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
            >
              {linkCopied ? t('common.copied') : t('referral.copyLink')}
            </button>
          </div>
          <button
            type="button" onClick={handleShare}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
          >
            {t('referral.share')}
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-2xl font-extrabold">{stats.directInvites}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('referral.directInvites')}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-2xl font-extrabold">{stats.teamSize}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('referral.teamSize')}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-2xl font-extrabold text-[var(--color-success)]">{formatLaunch(totalEarnedAmount)}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('referral.totalEarned')}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-2xl font-extrabold text-[var(--color-warning)]">{formatLaunch(unclaimedAmount)}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('referral.unclaimed')}</p>
            </div>
          </div>

          {/* Claim button */}
          {unclaimedAmount > 0n && (
            <button
              type="button" onClick={claim} disabled={claiming}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {claiming ? t('referral.claiming') : `${t('referral.claim')} (${formatLaunch(unclaimedAmount)} LAUNCH)`}
            </button>
          )}

          {/* Earnings by level */}
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
              {t('referral.earnings')}
            </p>
            <div className="space-y-2">
              {LEVELS.map(({ level, pct, color, textColor }) => {
                const entry = stats.earningsByLevel.find(e => e.level === level);
                const earned = entry ? formatLaunch(BigInt(entry.totalEarned)) : '0';
                return (
                  <div key={level} className="flex items-center gap-3">
                    <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                      <span className="text-[10px] font-extrabold text-white">L{level}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-bold">{earned} <span className="text-[10px] font-normal text-[var(--color-text-secondary)]">LAUNCH</span></p>
                        <span className={`text-xs font-bold ${textColor}`}>{pct}</span>
                      </div>
                      <p className="text-[10px] text-[var(--color-text-secondary)]">
                        {t('referral.betsCount', { count: entry?.betCount ?? 0 })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const wallet = useWalletContext();
  const { t, locale, setLocale } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isAdmin =
    wallet.isConnected &&
    !!wallet.address &&
    !!ADMIN_ADDRESS &&
    wallet.address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  const handleCopy = useCallback(() => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [wallet.address]);

  if (!wallet.isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center pb-24 md:pb-6">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <svg className="h-12 w-12 mx-auto mb-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <h2 className="text-lg font-bold mb-2">{t('profile.title')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {t('profile.connectToView')}
          </p>
          <button type="button" onClick={wallet.connect}
            className="rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)]">
            {t('common.connectWallet')}
          </button>
        </div>

        {/* About and Rules are visible even without wallet */}
        <div className="mt-4 space-y-3 text-left">
          <CollapsibleSection
            title={t('profile.about')}
            defaultOpen={false}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            }
          >
            <AboutSection />
          </CollapsibleSection>

          <CollapsibleSection
            title={t('profile.gameRules')}
            defaultOpen={false}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            }
          >
            <RulesSection />
          </CollapsibleSection>

          {/* Language switcher */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
                <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                </svg>
              </div>
              <p className="text-sm font-bold">{t('profile.language')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  locale === 'en'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="text-base">🇬🇧</span>
                {t('profile.langEn')}
              </button>
              <button
                type="button"
                onClick={() => setLocale('ru')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  locale === 'ru'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="text-base">🇷🇺</span>
                {t('profile.langRu')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-24 md:pb-6">
      {/* Profile card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 p-[2px]">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-bg)]">
              <Image src="/logo.png" alt="CoinFlip" width={28} height={28} className="object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
              />
              <span className="hidden text-lg font-black text-[var(--color-primary)]">CF</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{wallet.shortAddress}</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
              <span className="text-[10px] text-[var(--color-text-secondary)]">{t('profile.connected')}</span>
            </div>
          </div>
          {isAdmin && (
            <Link href="/admin"
              className="rounded-lg bg-[var(--color-primary)]/10 px-3 py-1.5 text-[10px] font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20">
              {t('common.admin')}
            </Link>
          )}
        </div>
      </div>

      {/* About */}
      <CollapsibleSection
        title={t('profile.about')}
        defaultOpen={false}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        }
      >
        <AboutSection />
      </CollapsibleSection>

      {/* Game Rules */}
      <CollapsibleSection
        title={t('profile.gameRules')}
        defaultOpen={false}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        }
      >
        <RulesSection />
      </CollapsibleSection>

      {/* Referral Program */}
      <CollapsibleSection
        title={t('referral.title')}
        defaultOpen={false}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        }
      >
        <ReferralSection isConnected={wallet.isConnected} />
      </CollapsibleSection>

      {/* Language switcher */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
            </svg>
          </div>
          <p className="text-sm font-bold">{t('profile.language')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
              locale === 'en'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <span className="text-base">🇬🇧</span>
            {t('profile.langEn')}
          </button>
          <button
            type="button"
            onClick={() => setLocale('ru')}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
              locale === 'ru'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <span className="text-base">🇷🇺</span>
            {t('profile.langRu')}
          </button>
        </div>
      </div>

      {/* Wallet management */}
      <CollapsibleSection
        title={t('profile.walletSection')}
        defaultOpen={false}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6zm0 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6" />
          </svg>
        }
      >
        <div className="pt-4 space-y-3">
          {/* Full address */}
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3">
            <p className="text-[10px] text-[var(--color-text-secondary)] mb-1">{t('profile.walletAddress')}</p>
            <p className="text-xs font-mono break-all leading-relaxed">{wallet.address}</p>
          </div>

          <div className="space-y-2">
            <button type="button" onClick={handleCopy}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
              <svg className="h-5 w-5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
              <span>{copied ? t('common.copied') : t('header.copyAddress')}</span>
            </button>

            <a href={`${EXPLORER_URL}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
              <svg className="h-5 w-5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              <span>{t('header.viewInExplorer')}</span>
            </a>
          </div>
        </div>
      </CollapsibleSection>

      {/* Danger zone */}
      <CollapsibleSection
        title={t('profile.dangerZone')}
        variant="danger"
        defaultOpen={false}
        icon={
          <svg className="h-5 w-5 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        }
      >
        <div className="pt-4 space-y-2">
          <button type="button" onClick={wallet.disconnect}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-warning)] transition-colors hover:bg-[var(--color-surface-hover)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            <div className="text-left">
              <span className="block">{t('header.disconnect')}</span>
              <span className="block text-[10px] text-[var(--color-text-secondary)] font-normal">{t('profile.disconnectDesc')}</span>
            </div>
          </button>

          <button type="button" onClick={wallet.forgetWallet}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-danger)]/30 px-4 py-3 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <div className="text-left">
              <span className="block">{t('profile.forgetWalletBtn')}</span>
              <span className="block text-[10px] text-[var(--color-text-secondary)] font-normal">{t('profile.forgetWalletDesc')}</span>
            </div>
          </button>
        </div>
      </CollapsibleSection>

      {/* App info */}
      <div className="text-center py-2">
        <p className="text-[10px] text-[var(--color-text-secondary)]">{t('profile.version')}</p>
      </div>
    </div>
  );
}
