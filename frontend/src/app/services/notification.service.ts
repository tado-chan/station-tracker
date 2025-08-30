import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Station } from '../models/station.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationId = 1;

  constructor() {
    this.initializeNotifications();
  }

  async initializeNotifications() {
    try {
      // Request permission for local notifications
      const permission = await LocalNotifications.requestPermissions();
      console.log('Local notification permission:', permission);

      // Initialize push notifications
      await this.initializePushNotifications();
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  }

  private async initializePushNotifications() {
    try {
      // Request permission for push notifications
      const permission = await PushNotifications.requestPermissions();
      
      if (permission.receive === 'granted') {
        // Register for push notifications
        await PushNotifications.register();

        // Listen for registration
        PushNotifications.addListener('registration', (token) => {
          console.log('Push registration success:', token.value);
          // Send token to your server
          this.sendTokenToServer(token.value);
        });

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
        });

        // Listen for incoming push notifications
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received:', notification);
        });

        // Listen for push notification actions
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification action performed:', notification);
        });
      }
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  }

  async sendStationEntryNotification(station: Station) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '駅に到着しました！',
            body: `${station.name}駅に到着しました。訪問が記録されました。`,
            id: this.notificationId++,
            schedule: { at: new Date(Date.now() + 1000) }, // 1 second delay
            sound: 'default',
            attachments: undefined,
            actionTypeId: 'STATION_ENTRY',
            extra: {
              stationId: station.id,
              stationName: station.name
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send station entry notification:', error);
    }
  }

  async sendStationExitNotification(station: Station, durationMinutes?: number) {
    try {
      const durationText = durationMinutes 
        ? `滞在時間: ${durationMinutes}分`
        : '';

      await LocalNotifications.schedule({
        notifications: [
          {
            title: '駅から離れました',
            body: `${station.name}駅から離れました。${durationText}`,
            id: this.notificationId++,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'default',
            attachments: undefined,
            actionTypeId: 'STATION_EXIT',
            extra: {
              stationId: station.id,
              stationName: station.name,
              duration: durationMinutes
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send station exit notification:', error);
    }
  }

  async sendDailyStatsNotification(totalVisits: number, uniqueStations: number) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '今日の駅記録',
            body: `本日は${totalVisits}回の訪問で、${uniqueStations}駅を訪れました！`,
            id: this.notificationId++,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'default',
            attachments: undefined,
            actionTypeId: 'DAILY_STATS',
            extra: {
              totalVisits,
              uniqueStations
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send daily stats notification:', error);
    }
  }

  async sendWeeklyGoalNotification(progress: number, goal: number) {
    try {
      const percentage = Math.round((progress / goal) * 100);
      
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '週間目標の進捗',
            body: `今週の目標達成率: ${percentage}% (${progress}/${goal}駅)`,
            id: this.notificationId++,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'default',
            attachments: undefined,
            actionTypeId: 'WEEKLY_GOAL',
            extra: {
              progress,
              goal,
              percentage
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send weekly goal notification:', error);
    }
  }

  private async sendTokenToServer(token: string) {
    try {
      // Send the push token to your Django backend
      // This would integrate with your user profile API
      console.log('Sending push token to server:', token);
      
      // Example API call (implement according to your backend)
      // await this.http.post('/api/accounts/push-token/', { token }).toPromise();
    } catch (error) {
      console.error('Failed to send token to server:', error);
    }
  }

  async cancelAllNotifications() {
    try {
      await LocalNotifications.cancel({
        notifications: await LocalNotifications.getPending().then(
          pending => pending.notifications.map(n => ({ id: n.id }))
        )
      });
    } catch (error) {
      console.error('Failed to cancel notifications:', error);
    }
  }

  async testNotification() {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'テスト通知',
            body: '駅記録アプリの通知が正常に動作しています。',
            id: 999,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'default',
            attachments: undefined,
            actionTypeId: 'TEST',
            extra: {}
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
    }
  }
}