import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import axios from 'axios';

interface TWSEResponse {
  stat: string;
  data: string[][];
  title: string;
}

export const stockHandler: FeatureHandler = {
  name: 'stock',
  async handle(event, _client) {
    if (!event.replyToken) return;
    if (event.message.type !== 'text') return;

    const parts = event.message.text.trim().split(/\s+/);
    const stockId = parts[1];

    if (!stockId) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '請輸入股票代號，例如：股價 2330' }],
      });
      return;
    }

    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const res = await axios.get<TWSEResponse>(
        `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockId}`,
        { timeout: 8000 }
      );

      if (res.data.stat !== 'OK' || !res.data.data?.length) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `查無股票代號 ${stockId}，請確認代號是否正確` }],
        });
        return;
      }

      const latest = res.data.data[res.data.data.length - 1];
      const name = res.data.title.match(/(\S+股份有限公司|\S+公司|\S+)/)?.[0] ?? stockId;
      const date = latest[0];
      const open = latest[3];
      const high = latest[4];
      const low = latest[5];
      const close = latest[6];
      const change = latest[7];
      const arrow = change.startsWith('-') ? '▼' : '▲';

      const text =
        `${stockId} ${name}\n` +
        `📅 ${date}\n` +
        `收盤：${close}\n` +
        `漲跌：${arrow} ${change}\n` +
        `開盤：${open}　最高：${high}　最低：${low}`;

      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text }],
      });
    } catch {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '取得股價失敗，請稍後再試' }],
      });
    }
  },
};
