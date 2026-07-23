import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 32;
const META_SUFFIX = '.meta';
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type ChunkSlot = 'legacy' | 'a' | 'b';

interface SecureManifest {
  version: 2;
  active: ChunkSlot | null;
  counts: Partial<Record<ChunkSlot, number>>;
  pending?: { slot: 'a' | 'b'; count: number };
}

function chunkKey(key: string, slot: ChunkSlot, index: number): string {
  return slot === 'legacy' ? `${key}.${index}` : `${key}.${slot}.${index}`;
}

function validCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_CHUNKS;
}

function isChunkSlot(value: unknown): value is ChunkSlot {
  return value === 'legacy' || value === 'a' || value === 'b';
}

function parseManifest(raw: string | null): SecureManifest | null {
  if (!raw) return null;

  // Version 1 stored only a decimal chunk count and used key.0, key.1, ...
  const legacyCount = Number(raw);
  if (validCount(legacyCount)) {
    return {
      version: 2,
      active: 'legacy',
      counts: { legacy: legacyCount },
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SecureManifest>;
    if (parsed.version !== 2) return null;
    if (parsed.active !== null && !isChunkSlot(parsed.active)) return null;

    const counts: Partial<Record<ChunkSlot, number>> = {};
    for (const slot of ['legacy', 'a', 'b'] as const) {
      const count = parsed.counts?.[slot];
      if (count != null) {
        if (!validCount(count)) return null;
        counts[slot] = count;
      }
    }
    if (parsed.active && !counts[parsed.active]) return null;

    let pending: SecureManifest['pending'];
    if (parsed.pending != null) {
      if (
        (parsed.pending.slot !== 'a' && parsed.pending.slot !== 'b') ||
        !validCount(parsed.pending.count)
      ) {
        return null;
      }
      pending = {
        slot: parsed.pending.slot,
        count: parsed.pending.count,
      };
    }

    return { version: 2, active: parsed.active ?? null, counts, pending };
  } catch {
    return null;
  }
}

async function readManifest(key: string): Promise<SecureManifest | null> {
  return parseManifest(await SecureStore.getItemAsync(key + META_SUFFIX));
}

async function writeManifest(key: string, manifest: SecureManifest): Promise<void> {
  await SecureStore.setItemAsync(
    key + META_SUFFIX,
    JSON.stringify(manifest),
    SECURE_OPTIONS,
  );
}

async function deleteSlot(
  key: string,
  slot: ChunkSlot,
  count: number,
): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, slot, index)),
    ),
  );
}

// Used only when metadata is missing/corrupt. It also removes chunks orphaned
// by the former write-before-metadata implementation.
async function sweepAllSlots(key: string): Promise<void> {
  for (const slot of ['legacy', 'a', 'b'] as const) {
    await deleteSlot(key, slot, MAX_CHUNKS);
  }
}

async function readSecureItem(key: string): Promise<string | null> {
  const manifest = await readManifest(key);
  if (!manifest?.active) return null;
  const count = manifest.counts[manifest.active];
  if (!count) return null;

  const chunks = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, manifest.active!, index)),
    ),
  );
  if (chunks.some((chunk) => chunk == null)) return null;
  return chunks.join('');
}

async function writeSecureItem(key: string, value: string): Promise<void> {
  let manifest = await readManifest(key);
  if (!manifest) {
    await sweepAllSlots(key);
    manifest = { version: 2, active: null, counts: {} };
  }

  // A prior interrupted write recorded exactly which inactive chunks may have
  // been written. Clean them while keeping the old active value readable.
  if (manifest.pending) {
    await deleteSlot(key, manifest.pending.slot, manifest.pending.count);
    manifest = { ...manifest, pending: undefined };
    await writeManifest(key, manifest);
  }

  const target: 'a' | 'b' = manifest.active === 'a' ? 'b' : 'a';
  const targetCount = manifest.counts[target];
  if (targetCount) await deleteSlot(key, target, targetCount);

  const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [''];
  if (chunks.length > MAX_CHUNKS) {
    throw new Error('Secure auth session is unexpectedly large.');
  }

  const baseManifest: SecureManifest = {
    ...manifest,
    counts: { ...manifest.counts },
    pending: undefined,
  };
  const pendingManifest: SecureManifest = {
    ...baseManifest,
    pending: { slot: target, count: chunks.length },
  };
  await writeManifest(key, pendingManifest);

  try {
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, target, index), chunk, SECURE_OPTIONS),
      ),
    );
  } catch (error) {
    // Keep the pending manifest if cleanup itself fails, so removeItem or the
    // next write knows exactly which keys must be retried.
    try {
      await deleteSlot(key, target, chunks.length);
      await writeManifest(key, baseManifest);
    } catch {
      // The pending manifest remains the recovery journal.
    }
    throw error;
  }

  let committed: SecureManifest = {
    version: 2,
    active: target,
    counts: { ...baseManifest.counts, [target]: chunks.length },
  };
  await writeManifest(key, committed);

  // Cleanup happens after the new manifest commit. A cleanup failure does not
  // invalidate the new session; the retained count is retried next time.
  const oldSlot = baseManifest.active;
  const oldCount = oldSlot ? baseManifest.counts[oldSlot] : undefined;
  if (oldSlot && oldCount) {
    try {
      await deleteSlot(key, oldSlot, oldCount);
      const counts = { ...committed.counts };
      delete counts[oldSlot];
      committed = { ...committed, counts };
      await writeManifest(key, committed);
    } catch {
      // committed still lists the old slot, allowing a later retry/removal.
    }
  }
}

async function removeSecureItem(key: string): Promise<void> {
  const manifest = await readManifest(key);
  if (!manifest) {
    await sweepAllSlots(key);
    await SecureStore.deleteItemAsync(key + META_SUFFIX);
    return;
  }

  const counts: Partial<Record<ChunkSlot, number>> = { ...manifest.counts };
  if (manifest.pending) {
    counts[manifest.pending.slot] = Math.max(
      counts[manifest.pending.slot] ?? 0,
      manifest.pending.count,
    );
  }
  await Promise.all(
    (Object.entries(counts) as [ChunkSlot, number][]).map(([slot, count]) =>
      deleteSlot(key, slot, count),
    ),
  );
  // Delete metadata last. If any chunk deletion fails, the recovery manifest
  // remains available for the next removal attempt.
  await SecureStore.deleteItemAsync(key + META_SUFFIX);
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);

    const secureValue = await readSecureItem(key);
    if (secureValue != null) return secureValue;

    // One-time migration for people updating from the AsyncStorage version.
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue != null) {
      await writeSecureItem(key, legacyValue);
      await AsyncStorage.removeItem(key);
    }
    return legacyValue;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await writeSecureItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS !== 'web') await removeSecureItem(key);
    await AsyncStorage.removeItem(key);
  },
};
