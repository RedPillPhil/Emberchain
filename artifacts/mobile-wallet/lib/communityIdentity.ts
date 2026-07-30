/**
 * Community identity helpers — nickname and anonymous-mode toggle.
 * Both stored in AsyncStorage (non-sensitive display preferences).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const NICKNAME_KEY = 'community_nickname';
const ANON_KEY = 'community_anon';

/** Returns the user's saved nickname, or null if not set. */
export async function getNickname(): Promise<string | null> {
  return AsyncStorage.getItem(NICKNAME_KEY);
}

/** Save a custom nickname. Pass empty string to clear. */
export async function saveNickname(name: string): Promise<void> {
  if (name.trim()) {
    await AsyncStorage.setItem(NICKNAME_KEY, name.trim());
  } else {
    await AsyncStorage.removeItem(NICKNAME_KEY);
  }
}

/**
 * Whether posts / messages should use "Anonymous" instead of the
 * user's address-derived or custom nickname.
 * Defaults to true (anonymous by default).
 */
export async function getAnonymous(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ANON_KEY);
  return v !== 'false'; // default = anonymous
}

export async function saveAnonymous(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ANON_KEY, value ? 'true' : 'false');
}
