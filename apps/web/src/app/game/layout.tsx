import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { MaintenanceBanner } from '@/components/layout/maintenance-banner';
import { DepositTriggerProvider } from '@/contexts/deposit-trigger-context';
import { WebSocketProvider } from '@/contexts/websocket-context';
import { SocialFab } from '@/components/features/social/social-fab';
import { SocialSidebar } from '@/components/features/social/social-sidebar';
import { TransferNotificationListener } from '@/components/features/social/transfer-notification-listener';

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <DepositTriggerProvider>
        <div className="h-dvh flex flex-col overflow-hidden">
          <MaintenanceBanner />
          <Header />
          <div className="flex-1 flex min-h-0">
            <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
            <SocialSidebar />
          </div>
          <BottomNav />
          <SocialFab />
          <TransferNotificationListener />
        </div>
      </DepositTriggerProvider>
    </WebSocketProvider>
  );
}
