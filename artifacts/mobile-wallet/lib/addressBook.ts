/**
 * Address book — stored in AsyncStorage as a JSON array.
 * Each contact has a unique id, label, and EMBR address.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'embr_address_book';

export interface Contact {
  id: string;
  label: string;
  address: string;
  note?: string;
  createdAt: string;
}

async function load(): Promise<Contact[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Contact[]) : [];
  } catch {
    return [];
  }
}

async function save(contacts: Contact[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(contacts));
}

export const addressBook = {
  list: load,

  async add(label: string, address: string, note?: string): Promise<Contact> {
    const contacts = await load();
    const contact: Contact = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: label.trim(),
      address: address.trim(),
      note: note?.trim(),
      createdAt: new Date().toISOString(),
    };
    contacts.unshift(contact);
    await save(contacts);
    return contact;
  },

  async update(id: string, patch: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<void> {
    const contacts = await load();
    const idx = contacts.findIndex((c) => c.id === id);
    if (idx === -1) return;
    contacts[idx] = { ...contacts[idx], ...patch };
    await save(contacts);
  },

  async remove(id: string): Promise<void> {
    const contacts = await load();
    await save(contacts.filter((c) => c.id !== id));
  },

  async find(address: string): Promise<Contact | undefined> {
    const contacts = await load();
    return contacts.find((c) => c.address.toLowerCase() === address.toLowerCase());
  },
};
