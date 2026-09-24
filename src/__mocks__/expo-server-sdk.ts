// Manual Jest mock for expo-server-sdk (wired via jest.config.js's
// moduleNameMapper). The real package ships ESM-only output that ts-jest's
// default transform config doesn't handle, which breaks every test whose
// import chain reaches services/push.ts transitively (most of the route
// tree, via notify.ts)  even though none of the current tests exercise
// push-sending itself. This stub implements just enough of the real
// class's shape for that import chain to load safely.
export class Expo {
  static isExpoPushToken(_token: string): boolean {
    return false;
  }
  chunkPushNotifications<T>(messages: T[]): T[][] {
    return [messages];
  }
  async sendPushNotificationsAsync(): Promise<unknown[]> {
    return [];
  }
  chunkPushNotificationReceiptIds(ids: string[]): string[][] {
    return [ids];
  }
  async getPushNotificationReceiptsAsync(): Promise<Record<string, unknown>> {
    return {};
  }
}

export type ExpoPushMessage = Record<string, unknown>;
export type ExpoPushTicket = Record<string, unknown>;
