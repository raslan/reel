const server = Bun.serve({
  port: 8080,
  fetch: () => new Response("reel server ok", { status: 200 }),
});
console.log(`reel smoke server on :${server.port}`);
