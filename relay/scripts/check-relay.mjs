// Throwaway local check: run `npm run dev` in relay/ in one terminal, then
// `node scripts/check-relay.mjs` in another. Opens two connections to the
// same room and confirms each sees the other's published payload. Not part
// of the automated test suite — talks to a real running wrangler dev server.

const ROOM = 'checkrm2';
const URL = `ws://localhost:8787/room/${ROOM}`;

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const seen = [];
    ws.addEventListener('open', () => console.log(`[${name}] connected`));
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      console.log(`[${name}] received`, msg);
      if (msg.type === 'welcome') {
        ws.send(JSON.stringify({
          type: 'publish',
          payload: { v: 1, players: [{ id: '1', name, x: 100, y: 200, z: 0, updatedAt: Date.now() }] },
        }));
      }
      if (msg.type === 'state') seen.push(msg);
    });
    ws.addEventListener('error', reject);
    setTimeout(() => resolve({ ws, seen }), 1500);
  });
}

const [a, b] = await Promise.all([connect('alice'), connect('bob')]);

const aliceSawBob = a.seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'bob'));
const bobSawAlice = b.seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'alice'));

console.log('alice saw bob:', aliceSawBob);
console.log('bob saw alice:', bobSawAlice);

a.ws.close();
b.ws.close();

if (!aliceSawBob || !bobSawAlice) {
  console.error('FAIL: relay did not broadcast cross-connection state');
  process.exit(1);
}
console.log('PASS');
process.exit(0);
