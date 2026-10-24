const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8765;

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css'
};

http.createServer((req, res) => {
  let filePath = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (req.url === '/') filePath = path.join(root, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Serving Dungeonary on http://localhost:${port}`));
