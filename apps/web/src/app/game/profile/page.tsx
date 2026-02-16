'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGetCurrentUser } from '@coinflip/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { ADMIN_ADDRESS, EXPLORER_URL, COINFLIP_CONTRACT, LAUNCH_CW20_CONTRACT } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';
import { useReferral } from '@/hooks/use-referral';
import { UserAvatar } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { customFetch } from '@coinflip/api-client/custom-fetch';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  ChevronDown, Code, ExternalLink, Coins, Building, Pencil, User,
  Info, BookOpen, Users, Languages, Wallet, Copy, AlertTriangle, LogOut, Trash2,
} from 'lucide-react';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={16}
      className={`text-[var(--color-text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    />
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
                href={`${EXPLORER_URL}/account/${COINFLIP_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 group"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <Code size={16} className="text-[var(--color-primary)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('profile.gameContract')}</p>
                  <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                    {COINFLIP_CONTRACT}
                  </p>
                </div>
                <ExternalLink size={16} className="flex-shrink-0 text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
              </a>
            )}
            {LAUNCH_CW20_CONTRACT && (
              <a
                href={`${EXPLORER_URL}/account/${LAUNCH_CW20_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 group"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Coins size={16} className="text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('profile.launchToken')}</p>
                  <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text)] group-hover:text-emerald-400 transition-colors">
                    {LAUNCH_CW20_CONTRACT}
                  </p>
                </div>
                <ExternalLink size={16} className="flex-shrink-0 text-[var(--color-text-secondary)] group-hover:text-emerald-400 transition-colors" />
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

function ChangeBranchSection() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState('');
  const [loading, setLoading] = useState(false);
  const [referrer, setReferrer] = useState<{ address: string; nickname: string | null } | null>(null);
  const [loadingRef, setLoadingRef] = useState(true);

  // Fetch current referrer on mount
  useEffect(() => {
    import('@/hooks/use-referral').then(({ checkHasReferrer }) => {
      checkHasReferrer().then((data) => {
        setReferrer(data.referrer);
        setLoadingRef(false);
      });
    });
  }, []);

  const handleChange = useCallback(async () => {
    const trimmed = addr.trim();
    if (!trimmed || !trimmed.startsWith('axm1')) {
      addToast('warning', t('auth.inviterNotFound'));
      return;
    }
    setLoading(true);
    try {
      const { changeBranch: doChange } = await import('@/hooks/use-referral');
      const result = await doChange(trimmed);
      if (result.ok) {
        addToast('success', t('referral.changeBranchSuccess'));
        setReferrer({ address: trimmed, nickname: null });
        setAddr('');
        setOpen(false);
      } else {
        const msg: Record<string, string> = {
          USER_NOT_FOUND: t('referral.changeBranchNotFound'),
          SELF_REFERRAL: t('referral.changeBranchSelf'),
          WOULD_CREATE_CYCLE: t('referral.changeBranchCycle'),
          INSUFFICIENT_BALANCE: t('referral.changeBranchNoBalance'),
        };
        addToast('error', msg[result.reason!] ?? result.reason ?? 'Error');
      }
    } catch {
      addToast('error', 'Network error');
    } finally {
      setLoading(false);
    }
  }, [addr, addToast, t]);

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      {/* Current referrer */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[var(--color-text-secondary)]">{t('referral.currentReferrer')}</p>
          {loadingRef ? (
            <p className="text-xs text-[var(--color-text-secondary)]">...</p>
          ) : referrer ? (
            <p className="text-xs font-mono">
              {referrer.nickname
                ? <span className="font-bold">{referrer.nickname}</span>
                : <span className="break-all">{referrer.address.slice(0, 12)}...{referrer.address.slice(-6)}</span>
              }
            </p>
          ) : (
            <p className="text-xs text-[var(--color-text-secondary)]">{t('referral.noReferrer')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-500 transition-colors hover:bg-amber-500/20"
        >
          <Users size={12} />
          {t('referral.changeBranch')}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-amber-500/20 space-y-3 pt-3">
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {t('referral.changeBranchDesc')}
          </p>
          <p className="text-[10px] font-bold text-amber-500">
            {t('referral.changeBranchCost')}
          </p>
          <input
            type="text"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder={t('referral.changeBranchInput')}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-mono placeholder:text-[var(--color-text-secondary)]/40 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleChange}
            disabled={loading || !addr.trim()}
            className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading ? '...' : t('referral.changeBranchConfirm')}
          </button>
        </div>
      )}
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
                  <Building size={16} className="text-[var(--color-text-secondary)]" />
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

      {/* Change Branch (paid feature) */}
      {isConnected && <ChangeBranchSection />}
    </div>
  );
}

function NicknameEditor({ currentNickname, address }: { currentNickname: string | null; address: string }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentNickname ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setValue(currentNickname ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [currentNickname]);

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      addToast('warning', t('profile.nicknameLengthError'));
      return;
    }
    setSaving(true);
    try {
      await customFetch({ url: '/api/v1/users/me', method: 'PATCH', data: { nickname: trimmed } });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
      addToast('success', t('profile.nicknameSaved'));
      setEditing(false);
    } catch {
      addToast('error', t('profile.nicknameError'));
    } finally {
      setSaving(false);
    }
  }, [value, addToast, queryClient, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  }, [handleSave]);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={20}
          placeholder={t('profile.enterNickname')}
          className="h-8 flex-1 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-bg)] px-2.5 text-sm font-medium outline-none focus:border-[var(--color-primary)] transition-colors"
        />
        <button type="button" onClick={handleSave} disabled={saving}
          className="h-8 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-bold text-white disabled:opacity-50 transition-opacity">
          {saving ? '...' : t('common.save')}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="h-8 rounded-lg border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]">
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={startEditing}
      className="group flex items-center gap-1.5 text-sm font-bold hover:text-[var(--color-primary)] transition-colors">
      <span>{currentNickname || t('profile.setNickname')}</span>
      <Pencil size={14} className="text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
    </button>
  );
}

export default function ProfilePage() {
  const wallet = useWalletContext();
  const { t, locale, setLocale } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { data: profileData } = useGetCurrentUser({ query: { enabled: wallet.isConnected } });

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
          <User size={48} className="mx-auto mb-4 text-[var(--color-text-secondary)]" />
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
            icon={<Info size={20} />}
          >
            <AboutSection />
          </CollapsibleSection>

          <CollapsibleSection
            title={t('profile.gameRules')}
            defaultOpen={false}
            icon={<BookOpen size={20} />}
          >
            <RulesSection />
          </CollapsibleSection>

          {/* Language switcher */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
                <Languages size={16} className="text-[var(--color-primary)]" />
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
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 p-[2px]">
            <div className="rounded-full overflow-hidden bg-[var(--color-bg)]">
              {wallet.address && <UserAvatar address={wallet.address} size={56} />}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <NicknameEditor
              currentNickname={(profileData as any)?.data?.nickname ?? null}
              address={wallet.address ?? ''}
            />
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
              <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">{wallet.shortAddress}</span>
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
        icon={<Info size={20} />}
      >
        <AboutSection />
      </CollapsibleSection>

      {/* Game Rules */}
      <CollapsibleSection
        title={t('profile.gameRules')}
        defaultOpen={false}
        icon={<BookOpen size={20} />}
      >
        <RulesSection />
      </CollapsibleSection>

      {/* Referral Program */}
      <CollapsibleSection
        title={t('referral.title')}
        defaultOpen={false}
        icon={<Users size={20} />}
      >
        <ReferralSection isConnected={wallet.isConnected} />
      </CollapsibleSection>

      {/* Language switcher */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
            <Languages size={16} className="text-[var(--color-primary)]" />
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
        icon={<Wallet size={20} />}
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
              <Copy size={20} className="text-[var(--color-text-secondary)]" />
              <span>{copied ? t('common.copied') : t('header.copyAddress')}</span>
            </button>

            <a href={`${EXPLORER_URL}/account/${wallet.address}`} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
              <ExternalLink size={20} className="text-[var(--color-text-secondary)]" />
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
        icon={<AlertTriangle size={20} className="text-[var(--color-danger)]" />}
      >
        <div className="pt-4 space-y-2">
          <button type="button" onClick={wallet.disconnect}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-warning)] transition-colors hover:bg-[var(--color-surface-hover)]">
            <LogOut size={20} />
            <div className="text-left">
              <span className="block">{t('header.disconnect')}</span>
              <span className="block text-[10px] text-[var(--color-text-secondary)] font-normal">{t('profile.disconnectDesc')}</span>
            </div>
          </button>

          <button type="button" onClick={wallet.forgetWallet}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-danger)]/30 px-4 py-3 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/5">
            <Trash2 size={20} />
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
