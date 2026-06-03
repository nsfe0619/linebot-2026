import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { db, DEFAULT_SETTINGS } from '../../services/firestore';

export const echoHandler: FeatureHandler = {
  name: 'echo',
  async handle(event, _client) {
    if (!event.replyToken) return;

    let replyText = DEFAULT_SETTINGS.defaultReply;
    try {
      const snap = await db.collection('settings').doc('global').get();
      if (snap.exists) {
        replyText =
          (snap.data() as { defaultReply?: string }).defaultReply ?? replyText;
      }
    } catch {
      console.error('[echo] Failed to load settings, using default');
    }

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: replyText }],
    });
  },
};
