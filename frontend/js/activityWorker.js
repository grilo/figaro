import { projectActivity } from './core/activityModel.js';

self.onmessage = ({ data }) => {
    try { self.postMessage({ id: data.id, result: projectActivity(data.input) }); }
    catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
self.postMessage({ ready: true });
