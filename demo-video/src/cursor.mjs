// Moves the mouse like a hand on a trackpad: along one of ghost-cursor's gently curved paths, replayed with a
// minimum-jerk speed curve (starts slow, peaks midway, settles into the target) at about 60 steps a second.
import { path } from 'ghost-cursor';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** Position along the move for time 0..1, with no sudden start or stop. */
const minimumJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);

/** The path's points, each with how far along the path it is. */
function measured(points) {
  let length = 0;
  return points.map((point, index) => {
    if (index > 0) {
      length += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
    }
    return { ...point, along: length };
  });
}

function pointAlong(points, distance) {
  const next = points.findIndex((point) => point.along >= distance);
  if (next <= 0) {
    return next === 0 ? points[0] : points.at(-1);
  }
  const before = points[next - 1];
  const after = points[next];
  const share = (distance - before.along) / (after.along - before.along || 1);
  return { x: before.x + (after.x - before.x) * share, y: before.y + (after.y - before.y) * share };
}

export function createCursor(page, start = { x: 1180, y: 700 }) {
  let at = start;

  /** Glides to a point. Longer moves take longer, but not proportionally, as a hand's do. */
  async function moveTo(target) {
    const distance = Math.hypot(target.x - at.x, target.y - at.y);
    if (distance < 2) {
      return;
    }
    const points = measured(path(at, target, { spreadOverride: Math.min(30, distance * 0.08), moveSpeed: 100 }));
    const length = points.at(-1).along;
    const duration = 300 + 160 * Math.log2(distance / 50 + 1);
    const started = Date.now();
    for (let t = 0; t < 1;) {
      t = Math.min(1, (Date.now() - started) / duration);
      const point = pointAlong(points, minimumJerk(t) * length);
      await page.mouse.move(point.x, point.y);
      await sleep(16);
    }
    await page.mouse.move(target.x, target.y);
    at = target;
  }

  /** Scrolls the element to the middle of the screen, smoothly, unless it's already in full view. */
  async function bringIntoView(locator) {
    const scrolled = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth) {
        return false;
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return true;
    });
    if (scrolled) {
      await sleep(700);
    }
  }

  /** A point inside the element, a little off its middle, as people rarely hit dead centre. Waits out a re-render. */
  async function pointIn(locator) {
    await bringIntoView(locator);
    let box = null;
    for (let attempt = 0; box === null && attempt < 10; attempt++) {
      try {
        box = await locator.boundingBox({ timeout: 2000 });
      } catch {
        await sleep(100);
      }
    }
    if (box === null) {
      throw new Error(`${locator} isn't on screen`);
    }
    const nudge = (size) => Math.max(-6, Math.min(6, (Math.random() - 0.5) * size * 0.3));
    return { x: box.x + box.width / 2 + nudge(box.width), y: box.y + box.height / 2 + nudge(box.height) };
  }

  /** Glides onto the element, aiming again if it moved meanwhile, as the header does when its countdown changes width. */
  async function reach(locator) {
    await moveTo(await pointIn(locator));
    const box = await locator.boundingBox();
    if (box !== null && (at.x < box.x || at.x > box.x + box.width || at.y < box.y || at.y > box.y + box.height)) {
      await moveTo(await pointIn(locator));
    }
  }

  return {
    moveTo,
    /** Glides onto the element and rests there. */
    hover: reach,
    /** Glides onto the element and clicks it. */
    async click(locator) {
      await reach(locator);
      await sleep(150);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
    },
    /** Glides onto the element and only shows a click, for controls whose real popup the video can't capture. */
    async fakeClick(locator) {
      await reach(locator);
      await sleep(150);
      await page.evaluate(() => window.__demoPress(true));
      await sleep(90);
      await page.evaluate(() => window.__demoPress(false));
    },
  };
}
