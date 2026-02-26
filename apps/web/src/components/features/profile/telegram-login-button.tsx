'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

export function TelegramLoginButton({
  botName,
  onAuth,
  buttonSize = 'medium',
  lang = 'en',
}: {
  botName: string;
  onAuth: (user: TelegramUser) => void;
  buttonSize?: 'large' | 'medium' | 'small';
  lang?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleAuth = useCallback(
    (user: TelegramUser) => onAuth(user),
    [onAuth],
  );

  useEffect(() => {
    window.onTelegramAuth = handleAuth;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    if (lang) script.setAttribute('data-lang', lang);

    const container = containerRef.current;
    if (container) {
      container.innerHTML = '';
      container.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
      if (container) container.innerHTML = '';
    };
  }, [botName, buttonSize, lang, handleAuth]);

  return <div ref={containerRef} />;
}
