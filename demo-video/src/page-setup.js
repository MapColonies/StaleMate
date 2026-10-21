// Runs in the page before the app. Playwright's video has no mouse pointer, so this draws one that follows the mouse and
// dips on clicks. It zooms the app to 133%, for text big enough to read in a video: the video records CSS pixels,
// so a higher deviceScaleFactor wouldn't help. It also starts the app in light mode, and makes the OS-notification
// checkbox usable: headless Chromium denies notifications whatever the permissions say.
// The pointer and other overlays hang off <html>, outside the zoomed <body>, so they use the mouse's own coordinates.
(() => {
  const zoom = document.createElement('style');
  zoom.textContent = 'body { zoom: 1.3333; }';
  window.addEventListener('DOMContentLoaded', () => document.documentElement.append(zoom));

  if (localStorage.getItem('stalemate.theme') === null) {
    localStorage.setItem('stalemate.theme', 'light');
  }

  class GrantedNotification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    close() {}
  }
  window.Notification = GrantedNotification;
  const query = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (descriptor) =>
    descriptor.name === 'notifications' ? Promise.resolve(Object.assign(new EventTarget(), { state: 'granted' })) : query(descriptor);

  const POINTER = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 28 28">
    <path d="M5 3 L5 22.5 L9.8 18 L13.2 25.4 L16.6 23.9 L13.3 16.7 L19.8 16.7 Z" fill="#111" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>
  </svg>`;

  let pointer = null;
  let arrow = null;

  /** A mouse button going down or up: the pointer dips, and a faint ring spreads from its tip. */
  function press(down) {
    arrow.style.transform = down ? 'scale(.86)' : 'scale(1)';
    if (!down) {
      return;
    }
    const tip = new DOMMatrix(getComputedStyle(pointer).transform);
    const ring = document.createElement('div');
    ring.style.cssText = `position:fixed;left:${tip.e + 5 - 14}px;top:${tip.f + 3 - 14}px;width:28px;height:28px;border-radius:50%;
      border:2px solid rgba(24,24,27,.35);pointer-events:none;z-index:2147483646;transform:scale(.4);opacity:.9;
      transition:transform .35s ease-out,opacity .35s ease-out`;
    document.documentElement.append(ring);
    requestAnimationFrame(() => {
      ring.style.transform = 'scale(1.2)';
      ring.style.opacity = '0';
    });
    setTimeout(() => ring.remove(), 400);
  }
  window.__demoPress = press;

  window.addEventListener('DOMContentLoaded', () => {
    pointer = document.createElement('div');
    pointer.style.cssText =
      'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))';
    arrow = document.createElement('div');
    arrow.innerHTML = POINTER;
    // The pointer's tip is at (5, 3) in its picture, so it dips towards the tip.
    arrow.style.cssText = 'transform-origin:5px 3px;transition:transform 90ms ease-out';
    pointer.append(arrow);
    document.documentElement.append(pointer);
    window.addEventListener('mousemove', (event) => (pointer.style.transform = `translate(${event.clientX - 5}px,${event.clientY - 3}px)`), true);
    window.addEventListener('mousedown', () => press(true), true);
    window.addEventListener('mouseup', () => press(false), true);
  });
})();
