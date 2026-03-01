import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { MaintenanceBanner } from '@/components/layout/maintenance-banner';
import { DepositTriggerProvider } from '@/contexts/deposit-trigger-context';

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <DepositTriggerProvider>
      <div className="min-h-screen flex flex-col">
        <MaintenanceBanner />
        <Header />
        <main className="flex-1">{children}</main>
        <BottomNav />
      </div>
    </DepositTriggerProvider>
  );
}
