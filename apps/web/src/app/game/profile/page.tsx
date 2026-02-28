'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGetCurrentUser } from '@coinflip/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { ADMIN_ADDRESS, EXPLORER_URL, COINFLIP_CONTRACT, LAUNCH_CW20_CONTRACT, TELEGRAM_BOT_NAME } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';
import { useReferral, fetchPlatformStats, type PlatformStats } from '@/hooks/use-referral';
import { UserAvatar } from '@/components/ui';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { VipBadge } from '@/components/ui/vip-badge';
import { useVipStatus } from '@/hooks/use-vip';
import { useToast } from '@/components/ui/toast';
import { customFetch } from '@coinflip/api-client/custom-fetch';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  ChevronDown, ChevronRight, Code, ExternalLink, Coins, Building, Pencil, User, Check,
  Info, BookOpen, Users, Languages, Wallet, Copy, AlertTriangle, LogOut, Trash2, Trophy,
  Loader2, BarChart3, Gift, Target, MessageCircle,
} from 'lucide-react';
import { GameStatsSection } from '@/components/features/profile/game-stats-section';
import { TelegramLoginButton, type TelegramUser } from '@/components/features/profile/telegram-login-button';

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
  compact = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'danger';
  compact?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const borderClass = variant === 'danger'
    ? 'border-[var(--color-danger)]/20'
    : 'border-[var(--color-border)]';
  const pad = compact ? 'px-4 py-3' : 'px-5 py-4';
  const contentPad = compact ? 'px-4 pb-4' : 'px-5 pb-5';

  return (
    <div className={`rounded-2xl border ${borderClass} bg-[var(--color-surface)] overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 ${pad} text-left transition-colors hover:bg-[var(--color-surface-hover)]`}
      >
        <span className="text-[var(--color-text-secondary)]">{icon}</span>
        <span className={`flex-1 font-bold ${compact ? 'text-xs' : 'text-sm'}`}>{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className={`${contentPad} border-t border-[var(--color-border)]/50`}>
          {children}
        </div>
      )}
    </div>
  );
}

function AboutSection() {
  const { t } = useTranslation();

  return (
    <div className="pt-4 space-y-3">
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] mb-4">
        <strong className="text-[var(--color-text)]">{t('common.appName')}</strong> — {t('profile.aboutDescShort')}
      </p>

      {/* 1. Механика рандома */}
      <CollapsibleSection
        title={t('profile.aboutSections.randomMechanics')}
        icon={<Code size={18} />}
        defaultOpen={false}
        compact
      >
        <div className="space-y-4">
          {/* Analogy */}
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {t('profile.winnerExplanation')}
          </p>

          {/* 3-step flow */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
              {t('profile.howItReallyWorks')}
            </p>
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold flex items-center justify-center">
                    {n}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[var(--color-text)]">
                      {t(`profile.fairnessStep${n}` as 'profile.fairnessStep1')}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed mt-0.5">
                      {t(`profile.fairnessStep${n}Desc` as 'profile.fairnessStep1Desc')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Why fair */}
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 mb-2">
              {t('profile.whyFairTitle')}
            </p>
            <ul className="space-y-1.5">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-start gap-2 text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                  <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t(`profile.whyFair${n}` as 'profile.whyFair1')}
                </li>
              ))}
            </ul>
          </div>

          {/* Commitment formula */}
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 overflow-x-auto">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)] mb-2">
              {t('profile.randomCodeTitle')}
            </p>
            <pre className="text-[10px] font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">{`${t('profile.randomCodeComment1')}
SHA256("coinflip_v1" + address + side + secret)

${t('profile.randomCodeComment2')}
SHA256("coinflip_v1" + "axm1abc..." + "heads" + 0x7f3a...)
→ a1b2c3...f9e8 ${t('profile.randomCodeComment3')}

${t('profile.randomCodeComment4')}
SHA256(${t('profile.randomCodeComment5')}) == ${t('profile.randomCodeComment6')}
✓ ${t('profile.randomCodeComment7')}`}</pre>
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
            <code className="text-[var(--color-primary)]">SHA-256</code> {t('profile.randomCodeExplanation')}
          </p>

          {/* Summary one-liner */}
          <div className="rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 p-3">
            <p className="text-xs text-[var(--color-text)] leading-relaxed font-medium">
              {t('profile.oneLiner')}
            </p>
          </div>

          {/* Commission */}
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
              {t('profile.commissionTitle')}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">{t('profile.commissionDesc')}</p>
          </div>
          {/* Security */}
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
              {t('profile.securityTitle')}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">{t('profile.securityDesc')}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. Как играть */}
      <CollapsibleSection
        title={t('profile.aboutSections.howToPlay')}
        icon={<BookOpen size={18} />}
        defaultOpen={false}
        compact
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">{t('profile.aboutSections.howToPlayIntro')}</p>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold flex items-center justify-center">
                {n}
              </span>
              <div>
                <p className="text-xs font-bold text-[var(--color-text)]">{t(`profile.aboutSections.step${n}Title` as 'profile.aboutSections.step1Title')}</p>
                <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed mt-0.5">
                  {t(`profile.aboutSections.step${n}Desc` as 'profile.aboutSections.step1Desc')}
                </p>
              </div>
            </div>
          ))}
          <div className="pt-2 space-y-2 border-t border-[var(--color-border)]/50">
            <div>
              <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
                {t('profile.aboutSections.depositTitle')}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.depositBody')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
                {t('profile.aboutSections.withdrawTitle')}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.withdrawBody')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
                {t('profile.aboutSections.betFlowTitle')}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.betFlowBody')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
                {t('profile.aboutSections.timingsTitle')}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.timingsBody')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
                {t('profile.aboutSections.branchChangeTitle')}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.branchChangeBody')}</p>
            </div>
          </div>
          <div className="pt-2 border-t border-[var(--color-border)]/50">
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-2">
              {t('profile.importantToKnow')}
            </p>
            <ul className="space-y-1.5">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex gap-2 text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                  <span className="text-[var(--color-warning)] shrink-0">•</span>
                  <span>{t(`profile.important${i}` as 'profile.important1')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Как это работает на сервере */}
      <CollapsibleSection
        title={t('profile.aboutSections.serverArchitecture')}
        icon={<Info size={18} />}
        defaultOpen={false}
        compact
      >
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
              {t('profile.aboutSections.contractTitle')}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed mb-2">{t('profile.aboutSections.contractBody')}</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.contractStorage')}</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed mt-2">{t('profile.aboutSections.contractMessages')}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
              {t('profile.aboutSections.relayerTitle')}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.relayerBody')}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-0.5">
              {t('profile.aboutSections.indexerTitle')}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{t('profile.aboutSections.indexerBody')}</p>
          </div>

          {/* Contract Addresses */}
          {(COINFLIP_CONTRACT || LAUNCH_CW20_CONTRACT) && (
            <div className="pt-2 border-t border-[var(--color-border)]/50">
              <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-2">
                {t('profile.contractsTitle')}
              </p>
              <div className="space-y-2">
                {COINFLIP_CONTRACT && (
                  <a
                    href={`https://axiomechain.pro/contract/${COINFLIP_CONTRACT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 group"
                  >
                    <Code size={14} className="text-[var(--color-primary)] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('profile.gameContract')}</p>
                      <p className="text-[10px] font-mono break-all text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                        {COINFLIP_CONTRACT}
                      </p>
                    </div>
                    <ExternalLink size={12} className="shrink-0 text-[var(--color-text-secondary)]" />
                  </a>
                )}
                {LAUNCH_CW20_CONTRACT && (
                  <a
                    href={`https://axiomechain.pro/contract/${LAUNCH_CW20_CONTRACT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 group"
                  >
                    <Coins size={14} className="text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('profile.launchToken')}</p>
                      <p className="text-[10px] font-mono break-all text-[var(--color-text)] group-hover:text-emerald-400">
                        {LAUNCH_CW20_CONTRACT}
                      </p>
                    </div>
                    <ExternalLink size={12} className="shrink-0 text-[var(--color-text-secondary)]" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function EventsInfoSection() {
  const { t } = useTranslation();

  return (
    <div className="pt-4 space-y-3">
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] mb-4">
        {t('profile.eventsIntro')}
      </p>

      <CollapsibleSection
        title={t('profile.contestsTitle')}
        icon={<Target size={18} className="text-indigo-400" />}
        defaultOpen={false}
        compact
      >
        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {t('profile.contestsDesc')}
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title={t('profile.rafflesTitle')}
        icon={<Gift size={18} className="text-amber-400" />}
        defaultOpen={false}
        compact
      >
        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {t('profile.rafflesDesc')}
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title={t('profile.prizeFundingTitle')}
        icon={<Coins size={18} className="text-emerald-400" />}
        defaultOpen={false}
        compact
      >
        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {t('profile.prizeFundingDesc')}
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title={t('profile.howToParticipateTitle')}
        icon={<BookOpen size={18} className="text-blue-400" />}
        defaultOpen={false}
        compact
      >
        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {t('profile.howToParticipateDesc')}
        </p>
      </CollapsibleSection>
    </div>
  );
}

type BranchStep = 'idle' | 'validating' | 'withdrawing' | 'transferring' | 'updating' | 'done' | 'error';

const BRANCH_STEPS: { key: BranchStep; labelRu: string; labelEn: string }[] = [
  { key: 'validating', labelRu: 'Проверка данных...', labelEn: 'Validating...' },
  { key: 'withdrawing', labelRu: 'Списание 1 000 COIN из vault...', labelEn: 'Withdrawing 1,000 COIN from vault...' },
  { key: 'transferring', labelRu: 'Перевод в казну платформы...', labelEn: 'Transferring to platform treasury...' },
  { key: 'updating', labelRu: 'Обновление реферальной ветки...', labelEn: 'Updating referral branch...' },
];

function ChangeBranchSection() {
  const { t, locale } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState('');
  const [step, setStep] = useState<BranchStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [referrer, setReferrer] = useState<{ address: string; nickname: string | null } | null>(null);
  const [loadingRef, setLoadingRef] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRu = locale === 'ru';
  const isProcessing = step !== 'idle' && step !== 'done' && step !== 'error';

  // Elapsed time counter
  useEffect(() => {
    if (isProcessing) {
      setElapsedSec(0);
      timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isProcessing]);

  // Fetch current referrer on mount
  useEffect(() => {
    import('@/hooks/use-referral').then(({ checkHasReferrer }) => {
      checkHasReferrer().then((data) => {
        setReferrer(data.referrer);
        setLoadingRef(false);
      });
    });
  }, []);

  const stepLabel = (s: BranchStep) => {
    const found = BRANCH_STEPS.find(bs => bs.key === s);
    return found ? (isRu ? found.labelRu : found.labelEn) : '';
  };

  const currentStepIdx = BRANCH_STEPS.findIndex(bs => bs.key === step);

  const handleChange = useCallback(async () => {
    const trimmed = addr.trim();
    if (!trimmed || !trimmed.startsWith('axm1')) {
      addToast('warning', t('auth.inviterNotFound'));
      return;
    }
    setErrorMsg('');
    setStep('validating');

    try {
      const { changeBranch: doChange } = await import('@/hooks/use-referral');

      // Simulate step progression based on timing
      // The server does: validate → withdraw → transfer → update DB
      // We show steps optimistically as the single API call progresses
      const stepTimer1 = setTimeout(() => setStep('withdrawing'), 1500);
      const stepTimer2 = setTimeout(() => setStep('transferring'), 6000);
      const stepTimer3 = setTimeout(() => setStep('updating'), 12000);

      const result = await doChange(trimmed);

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      if (result.ok) {
        setStep('done');
        addToast('success', t('referral.changeBranchSuccess'));
        setReferrer({ address: trimmed, nickname: null });
        // Invalidate balance cache to reflect deduction
        queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
        setTimeout(() => {
          setAddr('');
          setOpen(false);
          setStep('idle');
        }, 2000);
      } else {
        const msg: Record<string, string> = {
          USER_NOT_FOUND: t('referral.changeBranchNotFound'),
          SELF_REFERRAL: t('referral.changeBranchSelf'),
          WOULD_CREATE_CYCLE: t('referral.changeBranchCycle'),
          INSUFFICIENT_BALANCE: t('referral.changeBranchNoBalance'),
        };
        setStep('error');
        setErrorMsg(msg[result.reason!] ?? result.reason ?? 'Error');
      }
    } catch {
      setStep('error');
      setErrorMsg(isRu ? 'Ошибка сети. Попробуйте снова.' : 'Network error. Please try again.');
    }
  }, [addr, addToast, t, queryClient, isRu]);

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
          disabled={isProcessing}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
        >
          <Users size={12} />
          {t('referral.changeBranch')}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-amber-500/20 space-y-3 pt-3">
          {/* Processing overlay */}
          {isProcessing && (
            <div className="rounded-xl bg-[var(--color-bg)] border border-amber-500/20 p-4 space-y-3 animate-[fadeUp_0.2s_ease-out]">
              {/* Spinner + current step */}
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <span className="block h-8 w-8 animate-spin rounded-full border-3 border-amber-500/20 border-t-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-500 truncate">{stepLabel(step)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    {isRu ? 'Не закрывайте страницу' : "Don't close this page"} · {elapsedSec}{isRu ? 'с' : 's'}
                  </p>
                </div>
              </div>

              {/* Step progress */}
              <div className="space-y-1.5">
                {BRANCH_STEPS.map((bs, idx) => {
                  const isDone = idx < currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div key={bs.key} className="flex items-center gap-2">
                      {isDone ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20">
                          <Check size={10} className="text-green-500" />
                        </span>
                      ) : isCurrent ? (
                        <span className="flex h-4 w-4 items-center justify-center">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
                        </span>
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-border)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-secondary)]/30" />
                        </span>
                      )}
                      <span className={`text-[11px] ${isDone ? 'text-green-500' : isCurrent ? 'text-amber-500 font-medium' : 'text-[var(--color-text-secondary)]/50'}`}>
                        {isRu ? bs.labelRu.replace('...', '') : bs.labelEn.replace('...', '')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/10 p-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-500/80">
                  {isRu
                    ? 'Операция включает 2 транзакции в блокчейне. Обычно занимает 10-20 секунд.'
                    : 'This operation involves 2 blockchain transactions. Usually takes 10-20 seconds.'}
                </p>
              </div>
            </div>
          )}

          {/* Success state */}
          {step === 'done' && (
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-4 flex items-center gap-3 animate-[fadeUp_0.2s_ease-out]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
                <Check size={20} className="text-green-500" />
              </span>
              <div>
                <p className="text-sm font-bold text-green-500">{t('referral.changeBranchSuccess')}</p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">
                  {isRu ? '1 000 COIN списано' : '1,000 COIN deducted'}
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {step === 'error' && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 space-y-2 animate-[fadeUp_0.2s_ease-out]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                <p className="text-sm font-bold text-red-500">{isRu ? 'Ошибка' : 'Error'}</p>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">{errorMsg}</p>
              <button
                type="button"
                onClick={() => setStep('idle')}
                className="text-xs font-bold text-amber-500 hover:underline"
              >
                {isRu ? 'Попробовать снова' : 'Try again'}
              </button>
            </div>
          )}

          {/* Input form — only visible when idle */}
          {step === 'idle' && (
            <>
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
                disabled={!addr.trim()}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {t('referral.changeBranchConfirm')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReferralSection({ isConnected }: { isConnected: boolean }) {
  const { t } = useTranslation();
  const { code, stats, claiming, claim, shareUrl } = useReferral(isConnected);
  const [linkCopied, setLinkCopied] = useState(false);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchPlatformStats().then(setPlatformStats);
  }, []);

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

  const handleClaim = useCallback(async () => {
    const result = await claim();
    if (result.ok) {
      addToast('success', t('referral.claimSuccess'));
      queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
      fetchPlatformStats().then(setPlatformStats);
    } else {
      addToast('error', result.error ?? t('referral.claimFailed'));
    }
  }, [claim, addToast, queryClient, t]);

  const unclaimedAmount = stats?.balance?.unclaimed ? BigInt(stats.balance.unclaimed) : 0n;
  const totalEarnedAmount = stats?.balance?.totalEarned ? BigInt(stats.balance.totalEarned) : 0n;

  const LEVELS = [
    { level: 1, pct: '3%', commPct: '30%', color: 'from-violet-500 to-indigo-500', bgColor: 'bg-violet-500/10', textColor: 'text-violet-400', borderColor: 'border-violet-500/30' },
    { level: 2, pct: '1.5%', commPct: '15%', color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400', borderColor: 'border-blue-500/30' },
    { level: 3, pct: '0.5%', commPct: '5%', color: 'from-teal-500 to-emerald-500', bgColor: 'bg-teal-500/10', textColor: 'text-teal-400', borderColor: 'border-teal-500/30' },
  ];

  return (
    <div className="space-y-4">

      {/* Platform stats — collapsible */}
      <CollapsibleSection
        title={t('referral.platformStats')}
        icon={<BarChart3 size={18} />}
        defaultOpen={true}
        compact
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3">
            <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('referral.treasuryVault')}</p>
            <p className="text-lg font-extrabold text-[var(--color-primary)]">
              {platformStats ? formatLaunch(BigInt(platformStats.treasuryVaultAvailable)) : '—'}
            </p>
            <p className="text-[9px] text-[var(--color-text-secondary)]">COIN</p>
          </div>
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3">
            <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{t('referral.totalReferralPaid')}</p>
            <p className="text-lg font-extrabold text-[var(--color-success)]">
              {platformStats ? formatLaunch(BigInt(platformStats.totalReferralPaid)) : '—'}
            </p>
            <p className="text-[9px] text-[var(--color-text-secondary)]">COIN</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Referral info — collapsible */}
      <CollapsibleSection
        title={t('referral.howItWorks')}
        icon={<BookOpen size={18} />}
        defaultOpen={false}
        compact
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
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

          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
              {t('referral.rewardStructure')}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] mb-3 leading-relaxed">
              {t('referral.rewardStructureDesc')}
            </p>

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
                  <span className="font-bold">180 COIN <span className="text-[var(--color-text-secondary)] font-normal">(90%)</span></span>
                </div>
                <div className="h-px bg-[var(--color-border)]" />
                <div className="flex justify-between text-[11px]">
                  <span className="text-violet-400">{t('referral.exampleL1')}</span>
                  <span className="font-bold text-violet-400">6 COIN <span className="text-[var(--color-text-secondary)] font-normal">(3%)</span></span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-blue-400">{t('referral.exampleL2')}</span>
                  <span className="font-bold text-blue-400">3 COIN <span className="text-[var(--color-text-secondary)] font-normal">(1.5%)</span></span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-teal-400">{t('referral.exampleL3')}</span>
                  <span className="font-bold text-teal-400">1 COIN <span className="text-[var(--color-text-secondary)] font-normal">(0.5%)</span></span>
                </div>
                <div className="h-px bg-[var(--color-border)]" />
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--color-text-secondary)]">{t('referral.platform')}</span>
                  <span className="font-bold text-[var(--color-text-secondary)]">10 COIN <span className="font-normal">(5%)</span></span>
                </div>
              </div>
            </div>

            <p className="mt-2 text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
              {t('referral.rewardNote')}
            </p>

            {/* Token source info */}
            <div className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 mb-1">
                {t('referral.rewardSourceTitle')}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                {t('referral.rewardSourceDesc')}
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

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

      {/* Claim section — stats + claim button */}
      {stats && (
        <>
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
              {t('referral.stats')}
            </p>
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

            {unclaimedAmount > 0n && (
              <button
                type="button" onClick={handleClaim} disabled={claiming}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {claiming ? (
                  <>
                    <Loader2 size={18} className="animate-spin shrink-0" />
                    {t('referral.claiming')}
                  </>
                ) : (
                  `${t('referral.claim')} (${formatLaunch(unclaimedAmount)} COIN)`
                )}
              </button>
            )}
          </div>

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
                        <p className="text-sm font-bold">{earned} <span className="text-[10px] font-normal text-[var(--color-text-secondary)]">COIN</span></p>
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

function NicknameEditor({ currentNickname, address, loading }: { currentNickname: string | null; address: string; loading?: boolean }) {
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
      // Invalidate all caches that display the nickname
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
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

  if (loading) {
    return (
      <div className="h-5 w-24 animate-pulse rounded bg-[var(--color-border)]" />
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 w-full min-w-0 sm:flex-row sm:items-center sm:gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={20}
          placeholder={t('profile.enterNickname')}
          className="h-8 w-full min-w-0 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-bg)] px-2.5 text-sm font-medium outline-none focus:border-[var(--color-primary)] transition-colors sm:flex-1"
        />
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={handleSave} disabled={saving}
            className="h-8 flex-1 sm:flex-none rounded-lg bg-[var(--color-primary)] px-3 text-xs font-bold text-white disabled:opacity-50 transition-opacity">
            {saving ? '...' : t('common.save')}
          </button>
          <button type="button" onClick={() => setEditing(false)}
            className="h-8 flex-1 sm:flex-none rounded-lg border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]">
            {t('common.cancel')}
          </button>
        </div>
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

function TelegramSection({ telegram }: { telegram: { id: number; username: string | null; first_name: string | null; photo_url: string | null } | null }) {
  const { t, locale } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleTelegramAuth = useCallback(async (user: TelegramUser) => {
    try {
      await customFetch({
        url: '/api/v1/users/me/telegram',
        method: 'POST',
        data: user,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
      addToast('success', t('profile.telegramLinked'));
    } catch {
      addToast('error', t('profile.telegramLinkError'));
    }
  }, [queryClient, addToast, t]);

  const handleUnlink = useCallback(async () => {
    try {
      await customFetch({ url: '/api/v1/users/me/telegram', method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
      addToast('success', t('profile.telegramUnlinked'));
    } catch {
      addToast('error', t('profile.telegramUnlinkError'));
    }
  }, [queryClient, addToast, t]);

  if (telegram) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {telegram.photo_url ? (
            <img
              src={telegram.photo_url}
              alt={telegram.first_name || 'Telegram'}
              className="h-12 w-12 shrink-0 rounded-full border-2 border-[#2AABEE]/30 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2AABEE]/10 border-2 border-[#2AABEE]/30">
              <svg viewBox="0 0 24 24" fill="#2AABEE" className="h-6 w-6">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold truncate">
                {telegram.first_name || t('profile.telegramConnected')}
              </p>
              <span className="flex items-center gap-1 shrink-0 rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                <Check size={10} />
                {t('profile.telegramConnectedBadge')}
              </span>
            </div>
            {telegram.username && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">@{telegram.username}</p>
            )}
          </div>
        </div>

        {/* Unlink */}
        <button
          type="button"
          onClick={handleUnlink}
          className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 hover:bg-[var(--color-danger)]/5"
        >
          {t('profile.telegramUnlink')}
        </button>
      </div>
    );
  }

  if (!TELEGRAM_BOT_NAME) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        {t('profile.telegramDesc')}
      </p>
      <TelegramLoginButton
        botName={TELEGRAM_BOT_NAME}
        onAuth={handleTelegramAuth}
        lang={locale}
      />
    </div>
  );
}

export default function ProfilePage() {
  const wallet = useWalletContext();
  const { t, locale, setLocale } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { data: profileData, isLoading: profileLoading } = useGetCurrentUser({ query: { enabled: wallet.isConnected, staleTime: 30_000 } });
  const { data: vipStatus } = useVipStatus(wallet.isConnected);

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

        {/* About is visible even without wallet */}
        <div className="mt-4 space-y-3 text-left">
          <CollapsibleSection
            title={t('profile.about')}
            defaultOpen={false}
            icon={<Info size={20} />}
          >
            <AboutSection />
          </CollapsibleSection>

          <CollapsibleSection
            title={t('profile.eventsSection')}
            defaultOpen={false}
            icon={<Trophy size={20} className="text-amber-400" />}
          >
            <EventsInfoSection />
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
          <VipAvatarFrame tier={vipStatus?.tier} className={`relative shrink-0 ${!vipStatus?.tier ? 'rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 p-[2px]' : ''}`}>
            <div className="rounded-full overflow-hidden bg-[var(--color-bg)]">
              {wallet.address && <UserAvatar address={wallet.address} size={56} />}
            </div>
          </VipAvatarFrame>
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-2 ${getVipNameClass(vipStatus?.tier)}`}>
              <NicknameEditor
                currentNickname={(profileData as any)?.data?.nickname ?? null}
                address={wallet.address ?? ''}
                loading={profileLoading}
              />
              <VipBadge tier={vipStatus?.tier} />
            </div>
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

        {/* View public profile link */}
        {wallet.address && (
          <Link
            href={`/game/profile/${wallet.address}`}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <Trophy size={14} />
            {t('playerProfile.viewPublicProfile')}
            <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {/* Telegram */}
      <CollapsibleSection
        title={t('profile.telegramSection')}
        defaultOpen={false}
        icon={<MessageCircle size={20} className="text-[#2AABEE]" />}
      >
        <TelegramSection telegram={(profileData as any)?.data?.telegram ?? null} />
      </CollapsibleSection>

      {/* Game Statistics */}
      <CollapsibleSection
        title={t('profile.gameStats')}
        defaultOpen={true}
        icon={<Trophy size={20} />}
      >
        <GameStatsSection />
      </CollapsibleSection>

      {/* About */}
      <CollapsibleSection
        title={t('profile.about')}
        defaultOpen={false}
        icon={<Info size={20} />}
      >
        <AboutSection />
      </CollapsibleSection>

      {/* Events & Raffles */}
      <CollapsibleSection
        title={t('profile.eventsSection')}
        defaultOpen={false}
        icon={<Trophy size={20} className="text-amber-400" />}
      >
        <EventsInfoSection />
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

            <a href={`${EXPLORER_URL}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
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

          <button type="button" onClick={() => wallet.forgetWallet(wallet.address ?? undefined)}
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
