// Builds the public site into dist/.
// index.html is written as a page fragment (that's what the claude.ai artifact expects),
// so this wraps it in a full HTML document and copies the files it uses.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

// Vercel sets this during builds to the project's production domain.
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'supercooldudecarwash.com';
const siteUrl = `https://${host}`;

const page = await readFile('index.html', 'utf8');
const split = page.indexOf('<header');
if (split === -1) throw new Error('index.html: expected a <header> where the page body starts');
const head = page.slice(0, split).trim();
const body = page.slice(split).trim();

const description = 'Car washes from $8, and we clean phones for $4. Text 650-309-3989 to book.';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${description}">
<meta name="theme-color" content="#f5c814">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Super Cool Dude Carwash">
<meta property="og:title" content="Super Cool Dude Carwash">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${siteUrl}/">
<meta property="og:image" content="${siteUrl}/assets/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Super Cool Dude Carwash logo: sunglasses with a muddy car in one lens and a clean car in the other">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${siteUrl}/">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${head}
</head>
<body>
${body}
</body>
</html>
`;

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
for (const file of ['styles.css', 'app.js', 'scrub3d.js', 'favicon.png', 'apple-touch-icon.png']) await cp(file, `dist/${file}`);
await cp('assets', 'dist/assets', { recursive: true });
await cp('vendor', 'dist/vendor', { recursive: true });
console.log(`Built dist/ for ${siteUrl}`);
