// Hard limits shared by every runner. The Python tracer mirrors these values
// (they are injected into the harness at run time), so a change here changes
// every language runner at once.
export const MAX_STEPS = 10_000;
export const MAX_COLLECTION_ITEMS = 100;
export const MAX_STRING_LEN = 200;
export const MAX_DEPTH = 3;
export const WALL_CLOCK_MS = 5_000;
