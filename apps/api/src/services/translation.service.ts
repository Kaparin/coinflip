/**
 * Translation Service — auto-translate content between en/ru using google-translate-api-x.
 */

import translate from 'google-translate-api-x';
import { logger } from '../lib/logger.js';

export interface TranslatedContent {
  titleEn: string;
  titleRu: string;
  contentEn: string;
  contentRu: string;
}

class TranslationService {
  /** Translate a single text string */
  private async translate(text: string, from: string, to: string): Promise<string> {
    try {
      const result = await translate(text, { from, to });
      return result.text;
    } catch (err) {
      logger.warn({ err, from, to, textLen: text.length }, 'Translation failed, using source text as fallback');
      return text;
    }
  }

  /** Detect if text is Russian (contains Cyrillic characters) */
  private isRussian(text: string): boolean {
    const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
    return cyrillicCount > text.length * 0.15;
  }

  /**
   * Translate title + content into both en/ru.
   * Auto-detects source language, translates to the other.
   * @param contentField — the name of the "body" column (content for news, message for announcements)
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
      this.translate(content, from, to),
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
}

export const translationService = new TranslationService();
