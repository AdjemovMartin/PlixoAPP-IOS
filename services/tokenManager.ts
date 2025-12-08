import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const TOKEN_STORAGE_KEY = '@plixo_push_token';
const PLATFORM_STORAGE_KEY = '@plixo_platform';

export interface DeviceTokenData {
  deviceId: string | null;
  platform: 'ios' | 'android' | 'web';
}

type TokenChangeListener = (data: DeviceTokenData) => void;

class TokenManager {
  private listeners: TokenChangeListener[] = [];
  private currentToken: string | null = null;
  private platform: 'ios' | 'android' | 'web' = 'web';
  private isFetching: boolean = false;
  private fetchPromise: Promise<DeviceTokenData> | null = null;

  constructor() {
    this.platform = Platform.OS as 'ios' | 'android' | 'web';
  }

  async initialize(): Promise<DeviceTokenData> {
    if (this.isFetching && this.fetchPromise) {
      return this.fetchPromise;
    }

    this.isFetching = true;
    this.fetchPromise = this._initialize();
    const result = await this.fetchPromise;
    this.isFetching = false;
    this.fetchPromise = null;

    return result;
  }

  private async _initialize(): Promise<DeviceTokenData> {
    if (Platform.OS === 'web') {
      return { deviceId: null, platform: 'web' };
    }

    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      console.log('Running in Expo Go - push notifications disabled');
      return { deviceId: null, platform: this.platform };
    }

    try {
      const cachedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
      const cachedPlatform = await AsyncStorage.getItem(PLATFORM_STORAGE_KEY);

      if (cachedToken && cachedPlatform) {
        this.currentToken = cachedToken;
        this.platform = cachedPlatform as 'ios' | 'android';
        return { deviceId: cachedToken, platform: this.platform };
      }

      const token = await this.fetchNewToken();
      return { deviceId: token, platform: this.platform };
    } catch (error) {
      console.error('Error initializing token manager:', error);
      return { deviceId: null, platform: this.platform };
    }
  }

  private async fetchNewToken(): Promise<string | null> {
    if (!Device.isDevice) {
      console.warn('Must use physical device for Push Notifications');
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Push notification permission denied');
        await this.saveToken(null);
        return null;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

      if (!projectId) {
        console.warn('Project ID not found - using device-only mode for push notifications');
        await this.saveToken(null);
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;

      await this.saveToken(token);

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      }

      return token;
    } catch (error) {
      console.error('Error fetching push token:', error);
      await this.saveToken(null);
      return null;
    }
  }

  private async saveToken(token: string | null): Promise<void> {
    const oldToken = this.currentToken;
    this.currentToken = token;

    try {
      if (token) {
        await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
        await AsyncStorage.setItem(PLATFORM_STORAGE_KEY, this.platform);
      } else {
        await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
        await AsyncStorage.removeItem(PLATFORM_STORAGE_KEY);
      }

      if (oldToken !== token) {
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error saving token to AsyncStorage:', error);
    }
  }

  async refreshToken(): Promise<DeviceTokenData> {
    const token = await this.fetchNewToken();
    return { deviceId: token, platform: this.platform };
  }

  getCurrentToken(): DeviceTokenData {
    return { deviceId: this.currentToken, platform: this.platform };
  }

  onTokenChange(listener: TokenChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    const data = this.getCurrentToken();
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in token change listener:', error);
      }
    });
  }
}

export const tokenManager = new TokenManager();
