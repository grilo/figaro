import { createActivityWorker } from '../../../frontend/js/activityWorkerClient.js';
let workers;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { jest.useFakeTimers(); workers = []; });
afterEach(() => jest.useRealTimers());
function fixture() {
 return createActivityWorker({ createWorker: () => { const worker = { postMessage: jest.fn(), terminate: jest.fn() }; workers.push(worker); return worker; } });
}
test('activity worker initializes eagerly and carries matching projection results', async () => {
 const client=fixture(); expect(workers).toHaveLength(1);
 workers[0].onmessage({data:{ready:true}}); await client.ready;
 const result=client.project({source:'note'}); await flush();
 const {id,input}=workers[0].postMessage.mock.calls[0][0]; expect(input.source).toBe('note');
 workers[0].onmessage({data:{id:id+1,result:'stale'}});
 workers[0].onmessage({data:{id,result:'current'}}); await expect(result).resolves.toBe('current'); client.destroy();
});
test('typing cancels busy activity worker and rejects late output before a fresh worker runs', async () => {
 const client=fixture(); workers[0].onmessage({data:{ready:true}});
 const first=client.project({source:'old'}); const rejected=expect(first).rejects.toThrow('cancelled'); await flush();
 client.cancel(); await rejected; expect(workers[0].terminate).toHaveBeenCalled(); expect(workers).toHaveLength(2);
 workers[0].onmessage({data:{id:1,result:'old'}}); workers[1].onmessage({data:{ready:true}});
 const next=client.project({source:'new'}); await flush(); const {id}=workers[1].postMessage.mock.calls[0][0];
 workers[1].onmessage({data:{id,result:'new'}}); await expect(next).resolves.toBe('new');client.destroy();
});
test('worker startup and analysis deadlines fail explicitly and can recover without a main-thread fallback', async () => {
 const client=fixture(); const startup=expect(client.ready).rejects.toThrow('initialize'); jest.advanceTimersByTime(5000); await startup;
 const next=client.project({source:'note'}); const timeout=expect(next).rejects.toThrow('timed out');
 workers[1].onmessage({data:{ready:true}}); await flush(); jest.advanceTimersByTime(5000); await timeout;
 client.destroy(); await expect(client.project({})).rejects.toThrow('closed');
});
