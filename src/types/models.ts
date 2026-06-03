import type { Timestamp } from 'firebase-admin/firestore';

export interface MessageRecord {
  userId: string;
  groupId: string | null;
  message: string;
  reply: string;
  feature: string;
  timestamp: Timestamp;
}

export interface KeywordRule {
  keyword: string;
  matchType: 'exact' | 'contains';
  feature: string;
  enabled: boolean;
  createdAt: Timestamp;
}

export interface Settings {
  defaultReply: string;
  ttlEnabled: boolean;
  ttlDays: number;
}

export interface UserRecord {
  userId: string;
  displayName?: string;
  lastSeen: Timestamp;
}
