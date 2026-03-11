import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { MaintenanceBanner } from '@/components/layout/maintenance-banner';
import { DepositTriggerProvider } from '@/contexts/deposit-trigger-context';
import { WebSocketProvider } from '@/contexts/websocket-context';
import { SocialFab } from '@/components/features/social/social-fab';
import { SocialSidebar } from '@/components/features/social/social-sidebar';
import { TransferNotificationListener } from '@/components/features/social/transfer-notification-listener';
import { AiTicker } from '@/components/features/ticker/ai-ticker';

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <DepositTriggerProvider>
        <div className="h-dvh flex flex-col overflow-hidden">
          <MaintenanceBanner />
          <Header />
          <AiTicker />
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full mx-auto max-w-[1440px] flex">
              <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
              <SocialSidebar />
            </div>
          </div>
          <BottomNav />
          <SocialFab />
          <TransferNotificationListener />
        </div>
      </DepositTriggerProvider>
    </WebSocketProvider>
  );
}
