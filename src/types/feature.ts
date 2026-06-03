import type { webhook, messagingApi } from '@line/bot-sdk';

export interface FeatureHandler {
  name: string;
  handle: (
    event: webhook.MessageEvent,
    client: messagingApi.MessagingApiClient
  ) => Promise<void>;
}
