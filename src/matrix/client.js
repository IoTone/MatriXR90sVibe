// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import { createClient, ClientEvent, RoomEvent } from 'matrix-js-sdk';
import { store } from '../state/store.js';
import { playMessageNotification } from '../ui/notification.js';

const DEFAULT_HOMESERVER = 'https://matrix.org';

let matrixClient = null;
let resolvedBaseUrl = null;
let accessToken = null;

// Pagination state per room
const roomPagination = new Map(); // roomId -> { prevBatch, hasMore }

/**
 * Resolve the baseUrl for the Matrix SDK.
 * When the user targets the default homeserver, route through Vite's
 * dev proxy (same origin) to avoid CORS issues.
 */
function resolveBaseUrl(homeserver) {
  try {
    const hs = new URL(homeserver);
    const def = new URL(DEFAULT_HOMESERVER);
    if (hs.host === def.host) {
      return window.location.origin; // hits Vite proxy → /_matrix → homeserver
    }
  } catch { /* fall through */ }
  return homeserver;
}

export async function login(homeserver, user, password) {
  resolvedBaseUrl = resolveBaseUrl(homeserver);

  // Create a temporary client to authenticate
  const tempClient = createClient({ baseUrl: resolvedBaseUrl });
  const response = await tempClient.login('m.login.password', {
    user,
    password,
  });

  accessToken = response.access_token;

  // Recreate with access token
  matrixClient = createClient({
    baseUrl: resolvedBaseUrl,
    accessToken,
    userId: response.user_id,
    useAuthorizationHeader: true,
  });

  // Wait for initial sync — no initialSyncLimit so the server sends all joined rooms
  await new Promise((resolve, reject) => {
    const onSync = (state) => {
      console.log('[matrix] sync state:', state);
      if (state === 'PREPARED') {
        matrixClient.removeListener(ClientEvent.Sync, onSync);
        resolve();
      } else if (state === 'ERROR') {
        reject(new Error('Sync failed'));
      }
    };
    matrixClient.on(ClientEvent.Sync, onSync);
    matrixClient.startClient();
  });

  store.set('_userId', response.user_id);
  store.set('loggedIn', true);
  store.set('synced', true);

  listenForMessages();
}

/** Helper: authenticated fetch against the homeserver */
async function matrixFetch(path) {
  const resp = await fetch(`${resolvedBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`${path} returned ${resp.status}`);
  return resp.json();
}

/** Get room name via state event, with fallback */
async function fetchRoomName(roomId) {
  try {
    const ev = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name/`);
    return ev.name || roomId;
  } catch {
    return roomId;
  }
}

/** Check if a room is a space — tries SDK first, then API */
async function fetchRoomType(roomId) {
  // 1. Try the SDK's synced data (most reliable after PREPARED)
  if (matrixClient) {
    const room = matrixClient.getRoom(roomId);
    if (room) {
      const sdkType = room.getType?.();
      if (sdkType) {
        console.log(`[matrix] Room ${roomId} type from SDK: ${sdkType}`);
        return sdkType;
      }
      // Also check the create event content directly
      const createEvent = room.currentState?.getStateEvents('m.room.create', '');
      const createType = createEvent?.getContent?.()?.type;
      if (createType) {
        console.log(`[matrix] Room ${roomId} type from SDK create event: ${createType}`);
        return createType;
      }
    }
  }

  // 2. Fall back to API
  try {
    const ev = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.create/`);
    console.log(`[matrix] Room ${roomId} create event from API:`, JSON.stringify(ev));
    return ev.type || null;
  } catch (err) {
    console.warn(`[matrix] Could not fetch room type for ${roomId}:`, err.message);
    return null;
  }
}

export async function loadSpaces() {
  if (!accessToken) return;

  // 1. Get joined rooms from API
  const { joined_rooms } = await matrixFetch('/_matrix/client/v3/joined_rooms');
  console.log(`[matrix] Server reports ${joined_rooms.length} joined rooms`);

  // 2. Also check SDK's synced rooms (may know about rooms the API list misses)
  const sdkRooms = matrixClient ? matrixClient.getRooms() : [];
  const sdkRoomIds = new Set(sdkRooms.map((r) => r.roomId));
  const allRoomIds = new Set([...joined_rooms, ...sdkRoomIds]);
  console.log(`[matrix] Combined room IDs: ${allRoomIds.size} (API: ${joined_rooms.length}, SDK: ${sdkRooms.length})`);

  // 3. Resolve name and type for each room
  const joinedInfos = await Promise.all(
    [...allRoomIds].map(async (roomId) => {
      const [name, type] = await Promise.all([fetchRoomName(roomId), fetchRoomType(roomId)]);
      return { id: roomId, name, type };
    })
  );

  const joinedSpaces = joinedInfos.filter((r) => r.type === 'm.space');
  const joinedRooms = joinedInfos.filter((r) => r.type !== 'm.space');

  console.log(`[matrix] Classified: ${joinedSpaces.length} spaces, ${joinedRooms.length} rooms`);
  joinedSpaces.forEach((s) => console.log(`[matrix]   space: ${s.name} (${s.id})`));
  joinedRooms.forEach((r) => console.log(`[matrix]   room: ${r.name} (${r.id})`));

  // 4. Fetch public room directory to find browsable spaces
  let publicSpaces = [];
  try {
    const dir = await matrixFetch('/_matrix/client/v3/publicRooms');
    const publicEntries = dir.chunk || [];
    publicSpaces = publicEntries
      .filter((r) => r.room_type === 'm.space')
      .map((r) => ({ id: r.room_id, name: r.name || r.room_id }));
    console.log(`[matrix] Public directory: ${publicEntries.length} entries, ${publicSpaces.length} spaces`);
  } catch (err) {
    console.warn('[matrix] Could not fetch public rooms:', err);
  }

  // 5. Merge: joined spaces + public spaces (deduplicated)
  const seenIds = new Set();
  const allSpaces = [];
  for (const s of [...joinedSpaces, ...publicSpaces]) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      allSpaces.push({ id: s.id, name: s.name });
    }
  }

  console.log(`[matrix] Final space list: ${allSpaces.length} spaces`);

  const spaceList = [
    { id: '__all__', name: 'All Rooms' },
    ...allSpaces,
  ];
  store.set('spaces', spaceList);

  // Stash joined (non-space) rooms for "All Rooms"
  store.set('_allRooms', joinedRooms.map((r) => ({ id: r.id, name: r.name })));

  // Auto-select first actual space if available, otherwise "All Rooms"
  if (allSpaces.length > 0) {
    selectSpace(allSpaces[0].id);
  } else {
    selectSpace('__all__');
  }
}

export async function selectSpace(spaceId) {
  if (!matrixClient) return;
  store.set('selectedSpaceId', spaceId);
  store.set('rooms', []);
  store.set('selectedRoomId', null);
  store.set('messages', []);

  // Virtual "All Rooms" — use the cached room list
  if (spaceId === '__all__') {
    const allRooms = store.get('_allRooms') || [];
    console.log('[matrix] selectSpace(__all__) → rooms:', allRooms.map((r) => r.name));
    store.set('rooms', allRooms);
    // Auto-select first room so messages load immediately
    if (allRooms.length > 0) {
      selectRoom(allRooms[0].id);
    }
    return;
  }

  try {
    const hierarchy = await matrixClient.getRoomHierarchy(spaceId, 50, 1);
    const childRooms = hierarchy.rooms
      .filter((r) => r.room_id !== spaceId && r.room_type !== 'm.space')
      .map((r) => ({ id: r.room_id, name: r.name || r.room_id }));
    store.set('rooms', childRooms);
  } catch (err) {
    console.error('Failed to load space hierarchy:', err);
  }
}

const PAGE_SIZE = 20;

export async function selectRoom(roomId) {
  if (!matrixClient) return;
  console.log(`[matrix] selectRoom(${roomId})`);
  store.set('selectedRoomId', roomId);
  store.set('messages', []);

  // Reset pagination for this room
  roomPagination.delete(roomId);

  // Join the room if we're not already a member
  try {
    const room = matrixClient.getRoom(roomId);
    const membership = room?.getMyMembership?.();
    console.log(`[matrix] Current membership for ${roomId}: ${membership}`);
    if (membership !== 'join') {
      console.log(`[matrix] Joining room ${roomId}…`);
      await matrixClient.joinRoom(roomId);
      console.log(`[matrix] Joined ${roomId}`);
    }
  } catch (err) {
    console.error(`[matrix] Failed to join room ${roomId}:`, err);
  }

  // Fetch initial page of messages
  await fetchMessages(roomId, false);
}

/**
 * Fetch a page of messages for a room.
 * @param {string} roomId
 * @param {boolean} older - true to load older messages (prepend), false for initial load
 * @returns {boolean} true if there are more older messages to load
 */
async function fetchMessages(roomId, older) {
  const encodedRoom = encodeURIComponent(roomId);
  let url = `/_matrix/client/v3/rooms/${encodedRoom}/messages?dir=b&limit=${PAGE_SIZE}`;

  if (older) {
    const pag = roomPagination.get(roomId);
    if (!pag || !pag.hasMore) {
      console.log('[matrix] No more older messages to load');
      return false;
    }
    url += `&from=${encodeURIComponent(pag.prevBatch)}`;
  }

  console.log(`[matrix] Fetching messages: ${url}`);
  try {
    const data = await matrixFetch(url);
    console.log(`[matrix] Raw response: ${data.chunk?.length} events, end: ${data.end}`);

    const newMessages = (data.chunk || [])
      .filter((e) => e.type === 'm.room.message' && e.content?.body)
      .map((e) => ({
        sender: e.sender,
        body: e.content.body,
        ts: e.origin_server_ts,
      }))
      .reverse(); // dir=b returns newest-first, reverse to chronological

    // Update pagination token
    const hasMore = !!(data.end && data.chunk && data.chunk.length > 0);
    roomPagination.set(roomId, { prevBatch: data.end, hasMore });

    // Merge into store
    const current = store.get('messages') || [];
    if (older) {
      // Prepend older messages
      store.set('messages', [...newMessages, ...current]);
    } else {
      store.set('messages', newMessages);
    }

    console.log(`[matrix] Loaded ${newMessages.length} messages (total now: ${store.get('messages').length})`);
    return hasMore;
  } catch (err) {
    console.error(`[matrix] Failed to load messages for ${roomId}:`, err);
    return false;
  }
}

/**
 * Load older messages for the currently selected room.
 * Called by the chat panel when scrolling up.
 * @returns {boolean} true if more pages available
 */
export async function loadOlderMessages() {
  const roomId = store.get('selectedRoomId');
  if (!roomId) return false;
  return fetchMessages(roomId, true);
}

/** Check if there are more older messages to load */
export function hasOlderMessages() {
  const roomId = store.get('selectedRoomId');
  if (!roomId) return false;
  const pag = roomPagination.get(roomId);
  return pag?.hasMore ?? false;
}

function listenForMessages() {
  if (!matrixClient) return;
  matrixClient.on(RoomEvent.Timeline, (event, room) => {
    if (event.getType() !== 'm.room.message') return;
    if (room.roomId !== store.get('selectedRoomId')) return;

    const current = store.get('messages');
    const msg = {
      sender: event.getSender(),
      body: event.getContent().body || '',
      ts: event.getTs(),
    };
    store.set('messages', [...current, msg]);
    playMessageNotification();
  });
}

export async function sendMessage(text) {
  const roomId = store.get('selectedRoomId');
  if (!matrixClient || !roomId) return;

  // Use the API directly to send — avoids SDK cache issues
  try {
    const txnId = `m${Date.now()}`;
    await matrixFetch(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`
    ).catch(() => null); // ignore GET — we need PUT

    await fetch(`${resolvedBaseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ msgtype: 'm.text', body: text }),
    });
  } catch (err) {
    console.error('[matrix] Failed to send message:', err);
  }
}

export function getClient() {
  return matrixClient;
}

export function getUserId() {
  return matrixClient?.getUserId?.() || store.get('_userId') || '';
}

export async function logout() {
  try {
    if (matrixClient) {
      matrixClient.stopClient();
      await matrixClient.logout(true).catch(() => {});
    }
  } catch { /* ignore */ }
  matrixClient = null;
  accessToken = null;
  roomPagination.clear();
  store.set('loggedIn', false);
  store.set('synced', false);
  store.set('spaces', []);
  store.set('rooms', []);
  store.set('messages', []);
  store.set('selectedSpaceId', null);
  store.set('selectedRoomId', null);
  store.set('xrActive', false);
}
