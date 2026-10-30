import { describeBotClears } from './clears';

// Grouped so the CPU-heavy planners occupy few test workers.
for (const id of ['needle_gallery', 'silk_cloister', 'glass_crossing']) describeBotClears(id);
