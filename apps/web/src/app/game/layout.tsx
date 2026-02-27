import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { MaintenanceBanner } from '@/components/layout/maintenance-banner';

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MaintenanceBanner />
      <Header />
      <main className="flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}
