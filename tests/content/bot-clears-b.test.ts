import { describeBotClears } from './clears';

// Grouped so the CPU-heavy planners occupy few test workers.
for (const id of ['mourners_garden', 'last_platform', 'last_warden']) describeBotClears(id);
