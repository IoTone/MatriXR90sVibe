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

  // Get all joined rooms directly from the server
  const { joined_rooms } = await matrixFetch('/_matrix/client/v3/joined_rooms');
  console.log(`[matrix] Server reports ${joined_rooms.length} joined rooms`);

  // Fetch name + type for each room in parallel
  const roomInfos = await Promise.all(
    joined_rooms.map(async (roomId) => {
      const [name, type] = await Promise.all([fetchRoomName(roomId), fetchRoomType(roomId)]);
      return { id: roomId, name, type };
    })
  );

  const spaces = roomInfos.filter((r) => r.type === 'm.space');
  const rooms = roomInfos.filter((r) => r.type !== 'm.space');

  // Log for debugging
  spaces.forEach((s) => console.log(`[matrix] space: ${s.name} (${s.id})`));
  rooms.forEach((r) => console.log(`[matrix] room: ${r.name} (${r.id})`));

  // Always include "All Rooms" virtual entry first
  const spaceList = [
    { id: '__all__', name: 'All Rooms' },
    ...spaces.map((s) => ({ id: s.id, name: s.name })),
  ];
  store.set('spaces', spaceList);

  // Stash full room list for "All Rooms" selection
  store.set('_allRooms', rooms.map((r) => ({ id: r.id, name: r.name })));
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

  const room = matrixClient.getRoom(roomId);
  if (!room) {
    store.set('messages', []);
    return;
  }

  const timeline = room.getLiveTimeline().getEvents();
  const messages = timeline
    .filter((e) => e.getType() === 'm.room.message')
    .slice(-30)
    .map((e) => ({
      sender: e.getSender(),
      body: e.getContent().body || '',
      ts: e.getTs(),
    }));
  store.set('messages', messages);
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

  await matrixClient.sendMessage(roomId, {
    msgtype: 'm.text',
    body: text,
  });
}

export function getClient() {
  return matrixClient;
}
