export const STATE_VERSION = 2;

export function createEmptyState() {
  return {
    version: STATE_VERSION,
    profile: {},
    stores: [],
    visits: [],
    actions: [],
    appointments: [],
    planning: {},
    settings: {},
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
