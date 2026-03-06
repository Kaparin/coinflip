/**
 * Translation Service — auto-translate content between en/ru using DeepL API Free.
 * Falls back to source text if translation fails or API key is not configured.
 */

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/** DeepL Free keys end with ":fx", Pro keys don't */
function getDeeplApiUrl(apiKey: string): string {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

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
      logger.warn('DEEPL_API_KEY not set — skipping translation');
      return text;
    }

    const apiUrl = getDeeplApiUrl(env.DEEPL_API_KEY);

    try {
      logger.info({ sourceLang, targetLang, textLen: text.length, apiUrl }, 'DeepL: translating');

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text],
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.error({ status: res.status, errText, sourceLang, targetLang, apiUrl }, 'DeepL API error');
        return text;
      }

      const data = (await res.json()) as { translations: Array<{ text: string }> };
      const translated = data.translations?.[0]?.text ?? text;
      logger.info({ sourceLang, targetLang, originalLen: text.length, translatedLen: translated.length }, 'DeepL: success');
      return translated;
    } catch (err) {
      logger.error({ err, sourceLang, targetLang, textLen: text.length, apiUrl }, 'DeepL translation request failed');
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

    // If translation returned the same text (API key missing or failed),
    // use empty string for the target language so pickLocalized falls back to original.
    const titleDiff = translatedTitle !== title;
    const contentDiff = translatedContent !== content;

    if (isRu) {
      return {
        titleEn: titleDiff ? translatedTitle : '',
        titleRu: title,
        contentEn: contentDiff ? translatedContent : '',
        contentRu: content,
      };
    }
    return {
      titleEn: title,
      titleRu: titleDiff ? translatedTitle : '',
      contentEn: content,
      contentRu: contentDiff ? translatedContent : '',
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
