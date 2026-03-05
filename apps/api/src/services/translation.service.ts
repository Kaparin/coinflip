/**
 * Translation Service — auto-translate content between en/ru using DeepL API Free.
 * Falls back to source text if translation fails or API key is not configured.
 */

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

export interface TranslatedContent {
  titleEn: string;
  titleRu: string;
  contentEn: string;
  contentRu: string;
}

class TranslationService {
  /** Translate a single text string via DeepL */
  private async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text.trim()) return text;
    if (!env.DEEPL_API_KEY) {
      logger.debug('DEEPL_API_KEY not set — skipping translation');
      return text;
    }

    try {
      const res = await fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          auth_key: env.DEEPL_API_KEY,
          text,
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.warn({ status: res.status, errText, sourceLang, targetLang }, 'DeepL API error');
        return text;
      }

      const data = (await res.json()) as { translations: Array<{ text: string }> };
      return data.translations?.[0]?.text ?? text;
    } catch (err) {
      logger.warn({ err, sourceLang, targetLang, textLen: text.length }, 'Translation request failed');
      return text;
    }
  }

  /** Detect if text is primarily Russian (contains Cyrillic characters) */
  private isRussian(text: string): boolean {
    const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
    return cyrillicCount > text.length * 0.15;
  }

  /**
   * Translate title + content into both en/ru.
   * Auto-detects source language, translates to the other.
   */
  async translateContent(
    title: string,
    content: string,
  ): Promise<TranslatedContent> {
    const isRu = this.isRussian(title + ' ' + content);
    const from = isRu ? 'ru' : 'en';
    const to = isRu ? 'en' : 'ru';

    const [translatedTitle, translatedContent] = await Promise.all([
      this.translate(title, from, to),
      content ? this.translate(content, from, to) : Promise.resolve(content),
    ]);

    return {
      titleEn: isRu ? translatedTitle : title,
      titleRu: isRu ? title : translatedTitle,
      contentEn: isRu ? translatedContent : content,
      contentRu: isRu ? content : translatedContent,
    };
  }

  /**
   * Same as translateContent but returns message-keyed result for announcements.
   */
  async translateAnnouncement(
    title: string,
    message: string,
  ): Promise<{ titleEn: string; titleRu: string; messageEn: string; messageRu: string }> {
    const result = await this.translateContent(title, message);
    return {
      titleEn: result.titleEn,
      titleRu: result.titleRu,
      messageEn: result.contentEn,
      messageRu: result.contentRu,
    };
  }

  /**
   * Translate event title + description into both en/ru.
   */
  async translateEvent(
    title: string,
    description: string | null,
  ): Promise<{ titleEn: string; titleRu: string; descriptionEn: string | null; descriptionRu: string | null }> {
    const result = await this.translateContent(title, description ?? '');
    return {
      titleEn: result.titleEn,
      titleRu: result.titleRu,
      descriptionEn: description ? result.contentEn : null,
      descriptionRu: description ? result.contentRu : null,
    };
  }
}

export const translationService = new TranslationService();
