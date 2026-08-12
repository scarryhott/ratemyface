import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url?.startsWith("/health?")) {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, browser: "google-chrome", stub: true }));
    return;
  }
  res.statusCode = 404;
  res.end();
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[startup] DISPLAY=${process.env.DISPLAY || ":99"}`);
  console.log(`[startup] PORT=${PORT}`);
  console.log(`[browser-runtime] server listening on ${PORT}`);
});
