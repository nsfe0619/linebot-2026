import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { findBeauty } from './find-beauty';

const FALLBACK_MESSAGE = '找不到妹子，PTT 可能在睡覺 😴';

export const beautyHandler: FeatureHandler = {
  name: 'beauty',
  async handle(event, _client) {
    if (!event.replyToken) return;

    try {
      const result = await findBeauty();

      if (result) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'image',
              originalContentUrl: result.imageUrl,
              previewImageUrl: result.imageUrl,
            },
            {
              type: 'text',
              text: result.postUrl,
            },
          ],
        });
      } else {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: FALLBACK_MESSAGE }],
        });
      }
    } catch (err) {
      console.error('[beauty] findBeauty failed:', err);
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: FALLBACK_MESSAGE }],
      });
    }
  },
};
