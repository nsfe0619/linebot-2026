import dotenv from 'dotenv';
import { messagingApi } from '@line/bot-sdk';

dotenv.config();

export const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || '';
export const channelSecret = process.env.CHANNEL_SECRET || '';

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken,
});
