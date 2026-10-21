// Records the silent screen video: drives the app through every scene, holding each for as long as its narration.
// Usage: node src/record.mjs <audio dir with lengths.json> <out dir>
// Writes <out dir>/screen.mp4 and <out dir>/timeline.json, which says where each scene starts in the video.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createCursor } from './cursor.mjs';
import { fakeSnapshot, VIEWER } from './fake-data.mjs';
import { startScreencast } from './screencast.mjs';
import { startServers } from './servers.mjs';

const [audioDir, outDir] = process.argv.slice(2);
/** Silence after a scene, so one thought ends before the next starts, unless the scene sets its own "pause". */
const PAUSE_S = 0.7;

const scenes = JSON.parse(await readFile(new URL('../scenes.json', import.meta.url), 'utf8'));
const lengths = JSON.parse(await readFile(`${audioDir}/lengths.json`, 'utf8'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

await mkdir(outDir, { recursive: true });
const { url, stop } = await startServers();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript({ path: new URL('./page-setup.js', import.meta.url).pathname });
  let withNews = false;
  await context.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: fakeSnapshot(await response.json(), { withNews }) });
  });

  const page = await context.newPage();
  const screencast = await startScreencast(page, outDir);
  const cursor = createCursor(page);
  await page.goto(url);
  await page.getByRole('group', { name: 'View' }).waitFor();
  await page.locator('tbody tr').first().waitFor();
  // The cursor rests in plain sight until the narration first points at something.
  await page.mouse.move(1180, 700);
  await sleep(500);
  const videoStart = screencast.firstFrameAt();

  const header = page.locator('header');
  const view = (name) => page.getByRole('group', { name: 'View' }).getByRole('button', { name });
  const tab = (name) =>
    page
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .or(page.getByRole('tab', { name: new RegExp(`^${name}`) }))
      .first();
  const columnHeader = (name) => page.getByRole('columnheader', { name: new RegExp(`^${name}`) });
  const bucket = (title) => page.getByRole('heading', { name: title, exact: true });
  const drawer = page.getByRole('dialog', { name: 'Notifications' });
  const columnTitle = (name) => page.getByLabel(name, { exact: true }).getByText(name, { exact: true }).first();

  /**
   * Draws a <select> opening, as headless Chromium leaves its real popup out of the video: the box takes a focus ring and
   * the list slides open under it. Outside the zoomed <body>, so its sizes are the app's zoomed ones.
   */
  async function openOptions(select) {
    const box = await select.boundingBox();
    const options = await select.locator('option').allTextContents();
    await select.evaluate((element) => (element.style.boxShadow = '0 0 0 4px rgba(99,102,241,.3)'));
    await page.evaluate(
      ({ box, options }) => {
        const list = document.createElement('div');
        list.id = 'demo-options';
        list.style.cssText = `position:fixed;left:${box.x}px;top:${box.y + box.height + 5}px;min-width:${box.width}px;z-index:2147483646;
          background:#fff;border:1px solid #e4e4e7;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:5px;
          font:19px system-ui;opacity:0;transform:translateY(-6px);transition:opacity .15s ease-out,transform .15s ease-out`;
        list.innerHTML = options
          .map(
            (option) =>
              `<div data-option="${option}" style="padding:8px 13px;border-radius:7px;color:#18181b;transition:background .1s">${option}</div>`
          )
          .join('');
        list.addEventListener('mouseover', (event) => {
          for (const item of list.children) {
            item.style.background = item === event.target ? '#eef2ff' : '';
          }
        });
        list.addEventListener('mousedown', (event) => (event.target.style.background = '#e0e7ff'));
        document.documentElement.append(list);
        requestAnimationFrame(() => {
          list.style.opacity = '1';
          list.style.transform = 'none';
        });
      },
      { box, options }
    );
  }

  /** Closes the drawn list with the option picked. */
  async function pickOption(select, value) {
    await page.evaluate(() => {
      const list = document.getElementById('demo-options');
      list.style.opacity = '0';
      setTimeout(() => list.remove(), 150);
    });
    await sleep(120);
    await select.selectOption(value);
    await select.evaluate((element) => (element.style.boxShadow = ''));
  }

  const timeline = [];
  for (const scene of scenes.filter(({ id }) => id !== 'outro')) {
    const length = lengths[scene.id];
    const spoken = scene.say ?? scene.text;
    const start = Date.now();
    /** Waits for the moment the narration reaches the phrase, guessed from where it sits in the text. */
    const cue = async (phrase) => {
      const at = spoken.indexOf(phrase);
      if (at === -1) {
        throw new Error(`"${phrase}" isn't in the ${scene.id} narration`);
      }
      await sleep(start + (at / spoken.length) * length * 1000 - Date.now());
    };
    timeline.push({ id: scene.id, start: (start - videoStart) / 1000 });

    switch (scene.id) {
      case 'intro':
        await cue('every open pull request');
        await cursor.hover(tab('All'));
        await cue('whose turn');
        await cursor.hover(columnHeader('Waiting On'));
        await cue('how long');
        await cursor.hover(columnHeader('Age'));
        break;
      case 'pick-yourself': {
        const select = header.locator('select');
        await cue('Open');
        await cursor.fakeClick(select);
        await openOptions(select);
        await cue('pick your name');
        const option = page.locator(`#demo-options [data-option="${VIEWER}"]`);
        await cursor.hover(option);
        await cue("Here, I'm");
        // A real click on the drawn option: the app's <select> sits under it, unopened.
        await cursor.click(option);
        await pickOption(select, VIEWER);
        await cue('and now the "Your turn" tab');
        await cursor.hover(tab('Your turn'));
        break;
      }
      case 'table':
        await cursor.click(tab('Your turn'));
        await cue('shows the pull requests');
        await cursor.hover(page.locator('tbody tr').first().getByRole('link').first());
        await cue('like a review');
        await cursor.hover(page.locator('tbody tr').first().getByText('You').first());
        await cue('"Your PRs"');
        await cursor.hover(tab('Your PRs'));
        await cue('"Involving you"');
        await cursor.hover(tab('Involving you'));
        await cue('search');
        await cursor.hover(
          page
            .getByRole('searchbox')
            .or(page.getByPlaceholder(/Search/))
            .first()
        );
        await cue('filter');
        await cursor.hover(page.getByRole('button', { name: 'Waiting On' }));
        await cue('sort');
        await cursor.hover(columnHeader('Age'));
        break;
      case 'inbox':
        await cursor.click(view('Inbox'));
        await cue('simple lists');
        await cursor.hover(bucket('Your turn'));
        await cue('then your pull requests');
        await cursor.hover(bucket('Your PRs, waiting on others'));
        await cue('no reviewer');
        await cursor.hover(bucket('No Reviewer'));
        await cue('the rest');
        await cursor.hover(bucket('Rest of the Team'));
        break;
      case 'board':
        await cursor.click(view('Board'));
        await cue('a column for each');
        await cursor.hover(columnTitle('geo-jason'));
        await cursor.hover(columnTitle('ctrl-alt-elite'));
        await cue('Your column');
        await cursor.hover(columnTitle('You'));
        break;
      case 'notifications': {
        const bell = header.getByRole('button', { name: /^Notifications/ });
        await cue('When a pull request');
        withNews = true;
        // The app refetches when the tab becomes visible again, so the news lands without waiting for the next poll.
        await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
        // Already on the way as the news lands, to be at the bell when the narration names it.
        await cursor.hover(bell);
        await cue('Click it');
        await cursor.click(bell);
        await cue('Open the pull request');
        await cursor.hover(drawer.getByRole('link').first());
        await cue('or dismiss');
        await cursor.click(drawer.getByRole('button', { name: /^Dismiss (?!all)/ }).first());
        await cue('Tick');
        await cursor.click(drawer.getByRole('checkbox'));
        await cue('in the background');
        await cursor.click(drawer.getByRole('button', { name: 'Close' }));
        break;
      }
      case 'dark-mode':
        await cursor.click(header.getByRole('button', { name: /^Theme/ }));
        break;
    }
    const overrun = Date.now() - (start + length * 1000);
    if (overrun > 0) {
      console.warn(`The ${scene.id} scene ran ${overrun} ms past its narration`);
    }
    await sleep(start + (length + (scene.pause ?? PAUSE_S)) * 1000 - Date.now());
  }
  const endAt = Date.now();
  const end = (endAt - videoStart) / 1000;

  await screencast.stop(endAt, `${outDir}/screen.mp4`);
  await writeFile(`${outDir}/timeline.json`, JSON.stringify({ scenes: timeline, end }, null, 2));
} finally {
  await browser.close();
  stop();
}
