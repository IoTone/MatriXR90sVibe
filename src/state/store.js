class Store extends EventTarget {
  #state = {
    loggedIn: false,
    synced: false,
    spaces: [],
    selectedSpaceId: null,
    rooms: [],
    selectedRoomId: null,
    messages: [],
    xrActive: false,
  };

  get(key) {
    return this.#state[key];
  }

  set(key, value) {
    this.#state[key] = value;
    this.dispatchEvent(new CustomEvent('change', { detail: { key, value } }));
  }

  /** Subscribe to changes on a specific key */
  on(key, callback) {
    const handler = (e) => {
      if (e.detail.key === key) callback(e.detail.value);
    };
    this.addEventListener('change', handler);
    return () => this.removeEventListener('change', handler);
  }
}

export const store = new Store();
