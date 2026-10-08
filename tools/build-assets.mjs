// Gera os arquivos estáticos da interface: sprite de ícones (Hugeicons), fontes e logo/ícone do app.
// Rode com `npm run assets` depois de mudar a lista de ícones ou a logo.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import * as hugeicons from '@hugeicons/core-free-icons';

const ICONS = {
  home: 'Home01Icon', search: 'Search01Icon', yt: 'YoutubeIcon', spotify: 'SpotifyIcon',
  library: 'LibraryIcon', playlist: 'Playlist01Icon', plus: 'Add01Icon',
  heart: 'FavouriteIcon', dots: 'MoreVerticalIcon',
  play: 'PlayIcon', pause: 'PauseIcon', prev: 'PreviousIcon', next: 'NextIcon',
  volume: 'VolumeHighIcon', shuffle: 'ShuffleIcon', repeat: 'RepeatIcon',
  expand: 'ArrowLeft01Icon', 'win-min': 'MinusSignIcon', 'win-max': 'SquareIcon', collapse: 'PanelRightCloseIcon', 'collapse-left': 'PanelLeftOpenIcon', close: 'Cancel01Icon', user: 'UserIcon', copy: 'Copy01Icon',
  arrow: 'ArrowRight01Icon', check: 'Tick02Icon', logout: 'Logout01Icon', link: 'LinkSquare02Icon', fx: 'MagicWand01Icon', tune: 'ToolsIcon',
};

const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

// Ícones da landing page (landing/index.html), embutidos no próprio HTML.
const LANDING_ICONS = {
  arrow: 'ArrowUpRight01Icon', download: 'Download04Icon', globe: 'Globe02Icon', logout: 'Logout01Icon', check: 'Tick02Icon',
  search: 'Search01Icon', heart: 'FavouriteIcon', prev: 'PreviousIcon', next: 'NextIcon', pause: 'PauseIcon',
  close: 'Cancel01Icon', 'win-min': 'MinusSignIcon', 'win-max': 'SquareIcon',
  queue: 'Playlist01Icon', headphones: 'HeadphonesIcon', game: 'GameController03Icon', cursor: 'CursorPointer01Icon',
  lock: 'LockIcon', drive: 'HardDriveIcon', 'cloud-off': 'NoInternetIcon', github: 'GithubIcon', eye: 'ViewIcon', copy: 'Copy01Icon',
  fx: 'MagicWand01Icon', artist: 'UserIcon', chart: 'Analytics01Icon',
};

function symbols(icons) {
  return Object.entries(icons).map(([id, name]) => {
    const nodes = hugeicons[name];
    if (!nodes) throw new Error('Ícone inexistente no Hugeicons: ' + name);
    const body = nodes.map(([tag, attrs]) => {
      const a = Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${kebab(k)}="${v}"`).join(' ');
      return `<${tag} ${a}/>`;
    }).join('');
    return `<symbol id="${id}" viewBox="0 0 24 24">${body}</symbol>`;
  });
}

async function sprite() {
  await writeFile('ui/icons.svg', `<svg xmlns="http://www.w3.org/2000/svg">${symbols(ICONS).join('')}</svg>\n`);
}

// A landing é um arquivo só, que também abre direto do disco: os ícones vão embutidos nele.
async function landing() {
  await mkdir('landing/assets', { recursive: true });
  for (const file of ['inter-latin-wght-normal.woff2', 'space-grotesk-latin-wght-normal.woff2']) {
    await copyFile(`ui/fonts/${file}`, `landing/assets/${file}`);
  }
  await copyFile('ui/logo.png', 'landing/assets/logo.png');
  const block = `<!-- icons:start --><svg width="0" height="0" style="position:absolute" aria-hidden="true">${symbols(LANDING_ICONS).join('')}</svg><!-- icons:end -->`;
  for (const file of ['landing/index.html', 'landing/download.html']) {
    const html = await readFile(file, 'utf8');
    await writeFile(file, html.replace(/<!-- icons:start -->[\s\S]*?<!-- icons:end -->/, block));
  }
}

async function fonts() {
  await mkdir('ui/fonts', { recursive: true });
  for (const [pkg, file] of [['inter', 'inter'], ['space-grotesk', 'space-grotesk']]) {
    for (const subset of ['latin', 'latin-ext']) {
      const name = `${file}-${subset}-wght-normal.woff2`;
      await copyFile(`node_modules/@fontsource-variable/${pkg}/files/${name}`, `ui/fonts/${name}`);
    }
  }
}

// A arte é um quadrado cheio; os cantos arredondados são aplicados aqui.
async function logo() {
  const size = 1024;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}"/></svg>`);
  const master = await sharp('assets/logo-source.png')
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const png = s => sharp(master).resize(s, s).png().toBuffer();
  await writeFile('ui/logo.png', await png(256));

  // .ico com PNGs embutidos (janela, barra de tarefas, bandeja e o próprio .exe).
  const sizes = [16, 24, 32, 48, 64, 256];
  const images = await Promise.all(sizes.map(png));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(s === 256 ? 0 : s, at);
    header.writeUInt8(s === 256 ? 0 : s, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(images[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  await writeFile('host/app.ico', Buffer.concat([header, ...images]));
}

await Promise.all([sprite(), fonts(), logo()]);
await landing();
console.log('assets ok');
