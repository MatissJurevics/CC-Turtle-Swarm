import { createHttpServer } from './http-server.js';

const port = Number(process.env.PORT ?? 8787);
const pairingToken = process.env.TURTLE_PAIRING_TOKEN ?? 'dev-pairing-token';
const { server, plane } = createHttpServer({ pairingToken });

server.listen(port, () => {
  console.log(JSON.stringify({
    status: 'listening',
    service: 'computercraft-turtle-fleet',
    port,
    components: Object.keys(plane)
  }));
});
