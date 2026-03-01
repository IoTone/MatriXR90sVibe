// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import { store } from './state/store.js';
import { login, loadSpaces, sendMessage } from './matrix/client.js';
import { initThree, createARButton, startRenderLoop, scene, camera } from './xr/setup.js';
import { initInput, updateInput } from './xr/input.js';
import { SpacePanel } from './ui/space-panel.js';
import { RoomPanel } from './ui/room-panel.js';
import { ChatPanel } from './ui/chat-panel.js';
import { KeyboardPanel } from './ui/keyboard-panel.js';
import { UserPanel } from './ui/user-panel.js';
import { renderer } from './xr/setup.js';

// --- Prefill login form from env ---
const homeserverInput = document.getElementById('homeserver');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

if (import.meta.env.VITE_HOMESERVER) homeserverInput.value = import.meta.env.VITE_HOMESERVER;
if (import.meta.env.VITE_USERNAME) usernameInput.value = import.meta.env.VITE_USERNAME;
if (import.meta.env.VITE_PASSWORD) passwordInput.value = import.meta.env.VITE_PASSWORD;

// --- Login form ---
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const loginBtn = document.getElementById('login-btn');
const arContainer = document.getElementById('ar-button-container');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;
  loginStatus.textContent = 'Logging in…';

  const homeserver = document.getElementById('homeserver').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    await login(homeserver, username, password);
    loginStatus.textContent = 'Synced! Ready for AR.';
    // Trigger glitch fade-out animation on the login screen
    const loginScreen = document.getElementById('login-screen');
    loginScreen.classList.add('fade-out');
    setTimeout(() => {
      loginScreen.style.display = 'none';
      setupAR();
    }, 1000);
  } catch (err) {
    loginStatus.textContent = `Error: ${err.message}`;
    loginBtn.disabled = false;
  }
});

// --- DOM overlay text input ---
const overlayInput = document.getElementById('overlay-input');
const overlaySend = document.getElementById('overlay-send');

overlaySend.addEventListener('click', () => {
  const text = overlayInput.value.trim();
  if (text) {
    sendMessage(text);
    overlayInput.value = '';
  }
});

overlayInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    overlaySend.click();
  }
});

// --- AR setup ---
function setupAR() {
  initThree();
  createARButton();
  initInput(renderer, scene, camera);

  const panels = [];

  function teardownPanels() {
    panels.forEach((p) => scene.remove(p));
    panels.length = 0;
  }

  function handleLogout() {
    console.log('[main] Logout — returning to login screen');
    // End XR session if active
    const session = renderer.xr.getSession();
    if (session) session.end().catch(() => {});
    // Remove all panels from scene
    teardownPanels();
    // Show login screen again
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.display = '';
    loginScreen.classList.remove('fade-out');
    loginBtn.disabled = false;
    loginStatus.textContent = 'Logged out.';
  }

  // Create panels
  const spacePanel = new SpacePanel();
  const roomPanel = new RoomPanel();
  const chatPanel = new ChatPanel();
  const keyboardPanel = new KeyboardPanel();
  const userPanel = new UserPanel(handleLogout);

  // Position panels relative to headset origin (y=0 is eye level on most headsets)
  // Slightly below eye level so user looks down comfortably
  const panelY = -0.15;
  const kbY = -0.65;

  // Spaces — far left
  spacePanel.position.set(-0.6, panelY, -1.5);
  spacePanel.rotation.y = 0.3;

  // Rooms — center-left
  roomPanel.position.set(-0.1, panelY, -1.5);
  roomPanel.rotation.y = 0.1;

  // Chat — center-right
  chatPanel.position.set(0.45, panelY, -1.5);
  chatPanel.rotation.y = -0.15;

  // Keyboard — below chat, tilted like a desk keyboard
  keyboardPanel.position.set(0.45, kbY, -1.2);
  keyboardPanel.rotation.x = -0.4;
  keyboardPanel.rotation.y = -0.15;

  // User panel — far right
  userPanel.position.set(0.9, panelY, -1.5);
  userPanel.rotation.y = -0.35;

  scene.add(spacePanel);
  scene.add(roomPanel);
  scene.add(chatPanel);
  scene.add(keyboardPanel);
  scene.add(userPanel);
  panels.push(spacePanel, roomPanel, chatPanel, keyboardPanel, userPanel);

  // Debug logging
  store.on('spaces', (spaces) => console.log('Spaces:', spaces));
  store.on('rooms', (rooms) => console.log('Rooms:', rooms));
  store.on('messages', (msgs) => console.log('Messages:', msgs.length));

  // Now that panels are subscribed, populate spaces
  loadSpaces().catch((err) => console.error('[main] loadSpaces failed:', err));

  // Start render loop
  startRenderLoop((time, frame) => {
    updateInput(renderer, frame);
  });
}
