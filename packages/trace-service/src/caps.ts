import {
  MAX_COLLECTION_ITEMS,
  MAX_DEPTH,
  MAX_STEPS,
  MAX_STRING_LEN,
  WALL_CLOCK_MS,
} from '@visionds/trace-schema';

/** Caps injected into every stepper so all language runners share the limits. */
export const CAPS_JSON = JSON.stringify({
  MAX_STEPS,
  MAX_COLLECTION_ITEMS,
  MAX_STRING_LEN,
  MAX_DEPTH,
  WALL_CLOCK_MS,
});
