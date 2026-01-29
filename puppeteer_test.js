const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');
const path = require('path');
const util = require('util');

// Simple static server to serve the workspace for Puppeteer tests.
function createStaticServer(root, port=8000){
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if(urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = path.join(root, urlPath);
    fs.readFile(filePath, (err, data) => {
      if(err){ res.statusCode = 404; res.end('Not found'); return; }
      res.statusCode = 200;
      // basic content-type
      if(filePath.endsWith('.html')) res.setHeader('Content-Type','text/html; charset=utf-8');
      else if(filePath.endsWith('.js')) res.setHeader('Content-Type','application/javascript');
      else if(filePath.endsWith('.css')) res.setHeader('Content-Type','text/css');
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

(async () => {
  const out = { logs: [] };
  // start static server from current working directory
  const server = await createStaticServer(process.cwd(), 8000);
  console.log('Static server started on http://127.0.0.1:8000');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  // Collect network 404s and other failed responses to help debug missing includes
  const responses = [];
  page.on('response', res => {
    const status = res.status();
    if(status >= 400){
      responses.push({ url: res.url(), status });
      console.warn('Network response:', res.url(), status);
    /* puppeteer_test.js (moved to tests/puppeteer_test.js)
       Este archivo de pruebas fue movido a la carpeta `tests/`.
       Mantenerlo en el root puede provocar que herramientas de despliegue lo incluyan por error.

       Para ejecutar las pruebas locales use:

         node tests/puppeteer_test.js

    */
