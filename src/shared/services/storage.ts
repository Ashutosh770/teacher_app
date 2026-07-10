import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Secure storage for sensitive data (tokens, credentials)
export const secureStorage = {
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};

// Regular async storage for non-sensitive cached data
export const appStorage = {
  async set(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async get<T>(key: string): Promise<T | null> {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  },

  async getAllKeys(): Promise<readonly string[]> {
    return AsyncStorage.getAllKeys();
  },
};
