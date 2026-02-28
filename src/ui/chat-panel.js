import { Panel } from './panel.js';
import { createText } from './text-helpers.js';
import { store } from '../state/store.js';

const MAX_VISIBLE = 15;

export class ChatPanel extends Panel {
  constructor() {
    super({ title: 'Chat', width: 0.55, height: 0.55 });
    this.#bind();
  }

  #bind() {
    store.on('messages', (messages) => this.#render(messages));
    store.on('selectedRoomId', (roomId) => {
      // Update title to show room name
      const rooms = store.get('rooms') || [];
      const room = rooms.find((r) => r.id === roomId);
      this.setTitle(room ? `Chat — ${room.name}` : 'Chat');
    });
  }

  #render(messages) {
    this.clearContent();

    const visible = messages.slice(-MAX_VISIBLE);
    const lineHeight = 0.032;

    visible.forEach((msg, i) => {
      // Sender name
      const shortSender = msg.sender.split(':')[0].replace('@', '');
      const senderText = createText({
        text: shortSender,
        fontSize: 0.016,
        color: 0x00ffcc,
        anchorX: 'left',
        anchorY: 'top',
        maxWidth: 0.12,
        outlineWidth: 0.0008,
      });
      senderText.position.set(0, -(i * lineHeight), 0);
      this.content.add(senderText);

      // Message body
      const bodyText = createText({
        text: msg.body,
        fontSize: 0.016,
        color: 0xffffff,
        anchorX: 'left',
        anchorY: 'top',
        maxWidth: this.panelWidth - 0.18,
        outlineWidth: 0.0006,
      });
      bodyText.position.set(0.13, -(i * lineHeight), 0);
      this.content.add(bodyText);
    });
  }
}
