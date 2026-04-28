import { createHttpServer } from './http-server.js';

const port = Number(process.env.PORT ?? 8787);
const { server, plane } = createHttpServer();

server.listen(port, () => {
  console.log(JSON.stringify({
    status: 'listening',
    service: 'computercraft-turtle-fleet',
    port,
    components: Object.keys(plane)
  }));
});

