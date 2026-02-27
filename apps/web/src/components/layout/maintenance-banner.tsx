'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { API_URL } from '@/lib/constants';

interface PublicConfig {
  maintenance: boolean;
  maintenanceMessage: string;
}

export function MaintenanceBanner() {
  const { data } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/config/public`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as PublicConfig;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!data?.maintenance) return null;

  return (
    <div className="bg-amber-500/90 text-black px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
      <AlertTriangle size={16} />
      {data.maintenanceMessage || 'Platform is under maintenance. Please check back later.'}
    </div>
  );
}
