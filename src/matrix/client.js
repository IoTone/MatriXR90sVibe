import { createClient, ClientEvent, RoomEvent } from 'matrix-js-sdk';
import { store } from '../state/store.js';

const DEFAULT_HOMESERVER = 'https://t.rt.tl';

let matrixClient = null;
let resolvedBaseUrl = null;
let accessToken = null;

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

/** Check if a room is a space by reading its m.room.create state */
async function fetchRoomType(roomId) {
  try {
    const ev = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.create/`);
    return ev.type || null;
  } catch {
    return null;
  }
}

export async function loadSpaces() {
  if (!accessToken) return;

  // 1. Get joined rooms
  const { joined_rooms } = await matrixFetch('/_matrix/client/v3/joined_rooms');
  console.log(`[matrix] Server reports ${joined_rooms.length} joined rooms`);

  const joinedInfos = await Promise.all(
    joined_rooms.map(async (roomId) => {
      const [name, type] = await Promise.all([fetchRoomName(roomId), fetchRoomType(roomId)]);
      return { id: roomId, name, type };
    })
  );

  const joinedSpaces = joinedInfos.filter((r) => r.type === 'm.space');
  const joinedRooms = joinedInfos.filter((r) => r.type !== 'm.space');

  joinedSpaces.forEach((s) => console.log(`[matrix] joined space: ${s.name} (${s.id})`));
  joinedRooms.forEach((r) => console.log(`[matrix] joined room: ${r.name} (${r.id})`));

  // 2. Fetch public room directory to find browsable spaces
  let publicSpaces = [];
  try {
    const dir = await matrixFetch('/_matrix/client/v3/publicRooms');
    const publicEntries = dir.chunk || [];
    publicSpaces = publicEntries
      .filter((r) => r.room_type === 'm.space')
      .map((r) => ({ id: r.room_id, name: r.name || r.room_id }));
    const publicRooms = publicEntries
      .filter((r) => r.room_type !== 'm.space');
    console.log(`[matrix] Public directory: ${publicEntries.length} entries, ${publicSpaces.length} spaces, ${publicRooms.length} rooms`);
    publicSpaces.forEach((s) => console.log(`[matrix] public space: ${s.name} (${s.id})`));
  } catch (err) {
    console.warn('[matrix] Could not fetch public rooms:', err);
  }

  // 3. Merge: joined spaces + public spaces (deduplicated)
  const seenIds = new Set();
  const allSpaces = [];
  for (const s of [...joinedSpaces, ...publicSpaces]) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      allSpaces.push({ id: s.id, name: s.name });
    }
  }

  const spaceList = [
    { id: '__all__', name: 'All Rooms' },
    ...allSpaces,
  ];
  store.set('spaces', spaceList);

  // Stash joined (non-space) rooms for "All Rooms"
  store.set('_allRooms', joinedRooms.map((r) => ({ id: r.id, name: r.name })));

  // Auto-select "All Rooms" so the user immediately sees their joined rooms
  selectSpace('__all__');
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
    store.set('rooms', allRooms);
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

export async function selectRoom(roomId) {
  if (!matrixClient) return;
  store.set('selectedRoomId', roomId);
  store.set('messages', []);

  // Join the room if we're not already a member
  try {
    const room = matrixClient.getRoom(roomId);
    const membership = room?.getMyMembership?.();
    if (membership !== 'join') {
      console.log(`[matrix] Joining room ${roomId}…`);
      await matrixClient.joinRoom(roomId);
      console.log(`[matrix] Joined ${roomId}`);
    }
  } catch (err) {
    console.error(`[matrix] Failed to join room ${roomId}:`, err);
  }

  // Fetch recent messages via the API (works even if SDK cache is empty)
  try {
    const data = await matrixFetch(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=30`
    );
    const messages = (data.chunk || [])
      .filter((e) => e.type === 'm.room.message')
      .map((e) => ({
        sender: e.sender,
        body: e.content?.body || '',
        ts: e.origin_server_ts,
      }))
      .reverse(); // API returns newest-first with dir=b, we want chronological
    console.log(`[matrix] Loaded ${messages.length} messages from ${roomId}`);
    store.set('messages', messages);
  } catch (err) {
    console.error(`[matrix] Failed to load messages for ${roomId}:`, err);
  }
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
