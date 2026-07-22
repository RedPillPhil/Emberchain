/**
 * PIN storage helpers — PIN is stored directly in SecureStore,
 * which uses AES-256 (Android Keystore) / Keychain (iOS).
 * AsyncStorage tracks whether a PIN is enabled (non-secret flag).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'embr_pin';
const PIN_ENABLED_KEY = 'embr_pin_enabled';

export async function getPinEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(PIN_ENABLED_KEY);
  return v === 'true';
}

export async function setPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  await AsyncStorage.setItem(PIN_ENABLED_KEY, 'true');
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored === pin;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await AsyncStorage.setItem(PIN_ENABLED_KEY, 'false');
}
