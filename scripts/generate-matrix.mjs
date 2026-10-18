import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Every app ships at the one version release-please keeps for the whole repo.
const { '.': version } = JSON.parse(fs.readFileSync('.release-please-manifest.json', 'utf8'));

const output = execSync('pnpm exec turbo ls --output=json --filter="./apps/*"').toString();
const { packages } = JSON.parse(output);

const matrix = packages.items
  .map((pkg) => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(pkg.path, 'package.json'), 'utf8'));

    return { service: pkg.name, dockerfile: pkgJson.dockerfile, version };
  })
  // Only apps that name a dockerfile get an image.
  .filter((item) => item.dockerfile);

// GitHub Actions reads the matrix from stdout.
console.log(JSON.stringify(matrix));
