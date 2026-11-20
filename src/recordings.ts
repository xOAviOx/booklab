import { openDB, type DBSchema } from 'idb';
import type { RecordingFile } from './protocol';

export interface SavedRecording extends RecordingFile {
  id: string;
  savedAt: number;
}

interface Library extends DBSchema {
  recordings: { key: string; value: SavedRecording };
}

let connection: ReturnType<typeof openDB<Library>> | undefined;

function database() {
  connection ??= openDB<Library>('order-book-replay', 1, {
    upgrade(db) { db.createObjectStore('recordings', { keyPath: 'id' }); },
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function savedRecordings() {
  return (await (await database()).getAll('recordings')).sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveRecording(file: RecordingFile) {
  const entry = { ...file, id: crypto.randomUUID(), savedAt: Date.now() };
  await (await database()).put('recordings', entry);
  return entry;
}

export function exportRecording(file: RecordingFile) {
  const href = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${file.name.replace(/\.ndjson$/i, '').replace(/[<>:"/\\|?*]/g, '-')}.ndjson`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}
