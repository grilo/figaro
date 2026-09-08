import { createStartupTimings } from './usecases/startupTimings.js';

export const startupTimings = createStartupTimings({ now: () => performance.now() });
startupTimings.mark('bootstrap');
