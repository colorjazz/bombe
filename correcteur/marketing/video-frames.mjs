import { chromium } from 'playwright';
const [dir, name, mode] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + dir + '/video-' + name + '.html'); await p.waitForTimeout(1500);
await p.evaluate(() => document.fonts.ready);
const times = mode === 'keys' ? [1.0, 2.6, 4.8, 9.4, 10.0, 10.4, 10.8, 14.5] : Array.from({ length: 450 }, (_, i) => i / 30);
const out = dir + '/' + (mode === 'keys' ? 'k_' : 'f/');
for (let i = 0; i < times.length; i++) {
  await p.evaluate((t) => window.render(t), times[i]);
  await p.screenshot({ path: out + (mode === 'keys' ? name + '_' + times[i] : name + '_' + String(i).padStart(4, '0')) + (mode === 'keys' ? '.png' : '.jpg'), ...(mode === 'keys' ? {} : { type: 'jpeg', quality: 92 }) });
}
await b.close();
