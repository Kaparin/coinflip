import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { MaintenanceBanner } from '@/components/layout/maintenance-banner';
import { DepositTriggerProvider } from '@/contexts/deposit-trigger-context';
import { WebSocketProvider } from '@/contexts/websocket-context';
import { SocialFab } from '@/components/features/social/social-fab';
import { SocialSidebar } from '@/components/features/social/social-sidebar';

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <DepositTriggerProvider>
        <div className="min-h-screen flex flex-col">
          <MaintenanceBanner />
          <Header />
          <div className="flex-1 flex">
            <main className="flex-1 min-w-0">{children}</main>
            <SocialSidebar />
          </div>
          <BottomNav />
          <SocialFab />
        </div>
      </DepositTriggerProvider>
    </WebSocketProvider>
  );
}
