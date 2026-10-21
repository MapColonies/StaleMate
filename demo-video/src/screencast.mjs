// Captures the page as it paints, through Chromium's screencast: one high-quality JPEG per new frame, stamped with when
// it showed. Playwright's own video squeezes into 1 Mbit/s VP8, which smears big changes like a drawer sliding in.
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve as absolute } from 'node:path';

/** Starts capturing. Frames go to <dir>/frames until stop() turns them into a video. */
export async function startScreencast(page, outDir) {
  // ffmpeg's concat list resolves paths against the list's own folder, so give it absolute ones.
  const dir = absolute(outDir);
  const framesDir = `${dir}/frames`;
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const file = `${framesDir}/${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ file, at: metadata.timestamp * 1000 });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95 });

  return {
    /** When the first frame showed, in epoch ms: the video's time zero. */
    firstFrameAt: () => frames[0]?.at,
    /** Stops capturing at `endAt` (epoch ms) and encodes the frames, each held until the next, into `video`. */
    async stop(endAt, video) {
      await cdp.send('Page.stopScreencast');
      await Promise.all(writes);
      const list = frames.flatMap(({ file, at }, index) => [`file '${file}'`, `duration ${((frames[index + 1]?.at ?? endAt) - at) / 1000}`]);
      // The concat demuxer ignores the last duration unless its file is listed once more.
      list.push(`file '${frames.at(-1).file}'`);
      await writeFile(`${dir}/frames.txt`, `${list.join('\n')}\n`);
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn(
          'ffmpeg',
          [
            '-loglevel',
            'error',
            '-y',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            `${dir}/frames.txt`,
            '-vf',
            'fps=30,format=yuv420p',
            '-c:v',
            'libx264',
            '-crf',
            '14',
            '-preset',
            'medium',
            video,
          ],
          { stdio: 'inherit' }
        );
        ffmpeg.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
      });
      await rm(framesDir, { recursive: true });
      await rm(`${dir}/frames.txt`);
    },
  };
}
