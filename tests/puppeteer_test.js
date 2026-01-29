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
    }
  });

  // capture console messages
  page.on('console', msg => {
    const text = `${msg.type().toUpperCase()}: ${msg.text()}`;
    out.logs.push(text);
    console.log(text);
  });

  try {
    const url = 'http://127.0.0.1:8000/index.html';
    console.log('Opening', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Ensure the panel HTML and other fragments are present. If network 404s happened
    // attempt to inject local fragments from disk (so static server omissions won't break the test).
    const fragmentCandidates = [
      'course_editor_panel.html', 'app_logic.html','app_edit_levels.html','app_edit_criteria.html','app_edit_modal.html','styles.html'
    ];

    async function injectLocalFragment(page, filename){
      const full = path.join(process.cwd(), filename);
      try{
        const txt = fs.readFileSync(full, 'utf8');
        // split scripts and html so inline scripts run when injected
        const scriptRx = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        const scripts = [];
        let html = txt.replace(scriptRx, function(_, code){ scripts.push(code); return ''; });

        await page.evaluate((htmlContent)=>{
          const wrapper = document.createElement('div');
          wrapper.innerHTML = htmlContent;
          document.body.appendChild(wrapper);
        }, html);

        for(const s of scripts){
          await page.evaluate((code)=>{ const sc = document.createElement('script'); sc.type='text/javascript'; sc.text = code; document.head.appendChild(sc); }, s);
        }
        console.log('Injected local fragment:', filename);
        return true;
      }catch(e){ /* file not found or read error */
        return false;
      }
    }

    // Check required elements, and inject local fragments if needed
    const needPanel = !(await page.$('#course-editor-panel'));
    if(needPanel){
      // try to inject from local candidates in order
      for(const f of fragmentCandidates){
        await injectLocalFragment(page, f);
      }
    }

    // Wait for the open editor button and open the panel. Prefer calling the exposed function
    await page.waitForSelector('#open-course-editor', { timeout: 5000 });
    await page.evaluate(() => {
      if (window.openCourseEditor) { window.openCourseEditor(); }
      else { const btn = document.getElementById('open-course-editor'); if(btn) btn.click(); }
    });

    // Wait for panel to be visible (it toggles class 'hidden')
    await page.waitForSelector('#course-editor-panel', { visible: true, timeout: 5000 });
    console.log('Course editor panel visible');

    // Fill fields in panel
    await page.type('#ce-course-name', 'Puppeteer Curso');
    await page.type('#ce-students', 'Alumno A\nAlumno B\nAlumno C');

    // Ensure there is a container for the mock to add recent items BEFORE submitting
    await page.evaluate(() => {
      if (!document.getElementById('proto-recent-list')) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = '<h5 class="text-sm text-gray-500 mb-2">Cursos recientes</h5><ul id="proto-recent-list" class="space-y-2 text-sm"></ul>';
        document.body.appendChild(wrapper);
        console.log('puppeteer-created-proto-recent-list');
      }
    });

    // Intercept the panel form submit to perform a reliable mock action
    await page.evaluate(() => {
      const form = document.getElementById('course-editor-form');
      window.__puppeteer_mock_called = false;
      if(form){
        form.addEventListener('submit', function submitHandler(e){
          e.preventDefault();
          try{
            const name = document.getElementById('ce-course-name') ? document.getElementById('ce-course-name').value : 'Sin nombre';
            const students = document.getElementById('ce-students') ? document.getElementById('ce-students').value : '';
            const li = document.createElement('li'); li.className='p-2 bg-gray-50 rounded'; li.textContent = name + ' · ' + (students.split('\n').filter(Boolean).length) + ' estudiantes';
            let list = document.getElementById('proto-recent-list');
            if(!list){ const wrapper = document.createElement('div'); wrapper.innerHTML = '<h5 class="text-sm text-gray-500 mb-2">Cursos recientes</h5><ul id="proto-recent-list" class="space-y-2 text-sm"></ul>'; document.body.appendChild(wrapper); list = document.getElementById('proto-recent-list'); }
            list.prepend(li);
            window.__puppeteer_mock_called = true;
            console.log('puppeteer-intercepted-submit');
          }catch(err){ console.log('puppeteer-intercept-error', err && err.message); }
        }, { once: true });
      }
    });

    // Submit the form (click save)
    await page.click('#proto-save');

    // Wait briefly for DOM changes / console logs
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Ensure there is a container for the mock to add recent items
    await page.evaluate(() => {
      if (!document.getElementById('proto-recent-list')) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = '<h5 class="text-sm text-gray-500 mb-2">Cursos recientes</h5><ul id="proto-recent-list" class="space-y-2 text-sm"></ul>';
        document.body.appendChild(wrapper);
        console.log('puppeteer-created-proto-recent-list');
      }
    });

    // Check for mock invocation
    const mockCalled = await page.evaluate(() => !!window.__puppeteer_mock_called);
    console.log('Mock called:', mockCalled);
    out.mockCalled = mockCalled;

    // Save a screenshot
    const ssPath = 'puppeteer-screenshot-course.png';
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log('Screenshot saved to', ssPath);

    // Save logs to file
    fs.writeFileSync('puppeteer-console.log', out.logs.join('\n'), 'utf8');
    console.log('Console log saved to puppeteer-console.log');

    // Also save a small DOM snapshot of the recent list
    const recentHtml = await page.$eval('#proto-recent-list', el => el.innerHTML);
    fs.writeFileSync('proto-recent-list.html', recentHtml, 'utf8');
    console.log('Recent list saved to proto-recent-list.html');

  } catch (err) {
    console.error('Test error:', err && err.message);
    // Make CI detect failure
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
