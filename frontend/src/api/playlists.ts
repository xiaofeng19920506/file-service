import { apiFetch, parseJson } from './http';

export type PlaylistBlobRef = {
  id: string;
  title: string | null;
  titleEn: string | null;
  titleZhCn: string | null;
  titleZhTw: string | null;
  composer: string | null;
  author: string | null;
  originalFilename: string | null;
};

export type PlaylistSummary = {
  id: string;
  title: string;
  sourceUrl: string;
  youtubePlaylistId: string | null;
  itemCount: number;
  matchedCount: number;
  createdAt: string;
};

export type PlaylistAudioRef = {
  videoId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  blobId: string | null;
  errorCode: string | null;
  streamUrl?: string;
  expiresAt?: string;
};

export type PlaylistItem = {
  id: string;
  sortOrder: number;
  title: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  blobId: string | null;
  audio?: PlaylistAudioRef;
  blob: PlaylistBlobRef | null;
};

export type PlaylistDetail = {
  playlist: PlaylistSummary;
  items: PlaylistItem[];
  sharedByPlaylistId?: string;
  isOwner?: boolean;
};

export async function importPlaylist(url: string): Promise<PlaylistDetail> {
  const res = await apiFetch('/v1/playlists/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return parseJson<PlaylistDetail>(res);
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const res = await apiFetch('/v1/playlists');
  const data = await parseJson<{ playlists: PlaylistSummary[] }>(res);
  return data.playlists;
}

export async function getPlaylist(id: string): Promise<PlaylistDetail> {
  const res = await apiFetch(`/v1/playlists/${id}`);
  return parseJson<PlaylistDetail>(res);
}

export async function createPlaylist(title?: string): Promise<PlaylistDetail> {
  const res = await apiFetch('/v1/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  });
  return parseJson<PlaylistDetail>(res);
}

export async function addPlaylistItems(
  playlistId: string,
  url: string,
): Promise<PlaylistDetail & { addedCount: number; skippedCount: number }> {
  const res = await apiFetch(`/v1/playlists/${playlistId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return parseJson<PlaylistDetail & { addedCount: number; skippedCount: number }>(res);
}

export async function reorderPlaylistItems(
  playlistId: string,
  itemIds: string[],
): Promise<PlaylistDetail> {
  const res = await apiFetch(`/v1/playlists/${playlistId}/items/order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemIds }),
  });
  return parseJson<PlaylistDetail>(res);
}

export async function removePlaylistItem(playlistId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`/v1/playlists/${playlistId}/items/${itemId}`, {
    method: 'DELETE',
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function updatePlaylist(id: string, title: string): Promise<PlaylistDetail> {
  const res = await apiFetch(`/v1/playlists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return parseJson<PlaylistDetail>(res);
}

export async function deletePlaylist(id: string): Promise<void> {
  const res = await apiFetch(`/v1/playlists/${id}`, { method: 'DELETE' });
  await parseJson<{ ok: boolean }>(res);
}

export function isManualPlaylist(sourceUrl: string): boolean {
  return sourceUrl.startsWith('manual://');
}

export async function sharePlaylist(
  playlistId: string,
  body: { email: string; message?: string },
): Promise<void> {
  const res = await apiFetch(`/v1/playlists/${playlistId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function getSharedPlaylist(token: string): Promise<PlaylistDetail> {
  const res = await apiFetch(`/v1/playlists/share/${encodeURIComponent(token)}`);
  return parseJson<PlaylistDetail>(res);
}

export async function acceptSharedPlaylist(token: string): Promise<PlaylistDetail> {
  const res = await apiFetch(`/v1/playlists/share/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
  return parseJson<PlaylistDetail>(res);
}

export async function patchPlaylistItemBlob(
  playlistId: string,
  itemId: string,
  blobId: string | null,
): Promise<PlaylistItem> {
  const res = await apiFetch(`/v1/playlists/${playlistId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobId }),
  });
  const data = await parseJson<{ item: PlaylistItem }>(res);
  return data.item;
}
