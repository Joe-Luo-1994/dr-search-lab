import { buildDemo, serveDemo } from './demo.mjs';
const { root } = await buildDemo();
const { server, url } = await serveDemo(root, Number(process.env.PAGEFIND_PORT || 3101));
console.log(`Synthetic only; no authentication. Local server: ${url}\nBuild: ${root}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
