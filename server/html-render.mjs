import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTML_TEMPLATE } from './html-template.mjs';

const distHtmlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'index.html',
);

const ROBOT_ALLOW = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export const textValid = (value, max = 5000) => typeof value === 'string' && value.length <= max;

export const safeSiteUrl = (value) =>
  textValid(value, 300) &&
  (value === '' || /^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?\/?$/.test(value.trim()));

export const verificationValid = (value) =>
  textValid(value, 200) && /^[a-zA-Z0-9._-]*$/.test(value.trim());

export function normalizeOrigin(value) {
  const cleaned = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  return cleaned || 'https://ibrahimabdullah.biz.id';
}

export function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function absoluteMediaUrl(origin, url) {
  if (!url) return `${origin}/images/portrait.webp`;
  if (/^https?:\/\//.test(url)) return url;
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function validSocialLinks(profile) {
  return [profile?.github, profile?.instagram, profile?.linkedin].filter(
    (url) =>
      typeof url === 'string' &&
      /^https:\/\/[^\s]+$/.test(url) &&
      !/^https:\/\/(github\.com|www\.instagram\.com|www\.linkedin\.com)\/?$/.test(url),
  );
}

export function buildRobotsTxt(content) {
  const origin = normalizeOrigin(content?.settings?.siteUrl);
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'User-agent: Googlebot',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    'Disallow: /admin',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Disallow: /admin',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    'Disallow: /admin',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    'Disallow: /admin',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    'Disallow: /admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
  ].join('\n');
}

export function buildSitemapXml(content) {
  const origin = normalizeOrigin(content?.settings?.siteUrl);
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    { loc: `${origin}/`, changefreq: 'weekly', priority: '1.0' },
    ...(content?.projects || []).map((project) => ({
      loc: `${origin}/projects/${project.slug}`,
      changefreq: 'monthly',
      priority: '0.8',
    })),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    ),
    '</urlset>',
  ].join('\n');
}

export function resolveLocation(content) {
  const seoLoc = content?.settings?.seoLocation?.trim();
  const profLoc = content?.profile?.location?.trim();
  if (seoLoc && (!profLoc || profLoc.toLowerCase() === 'indonesia')) return seoLoc;
  if (profLoc && seoLoc && !profLoc.toLowerCase().includes(seoLoc.split(',')[0].trim().toLowerCase())) {
    return seoLoc;
  }
  return profLoc || seoLoc || 'Parepare, Sulawesi Selatan, Indonesia';
}

function cityOnly(locationText) {
  return String(locationText || 'Parepare').split(',')[0].trim() || 'Parepare';
}

function buildLocationPlace(locationText) {
  const parts = String(locationText || 'Parepare, Sulawesi Selatan, Indonesia')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const locality = parts[0] || 'Parepare';
  const region = parts.length >= 3 ? parts[1] : parts.length === 2 && !/^indonesia$/i.test(parts[1]) ? parts[1] : undefined;
  return {
    '@type': 'Place',
    name: locationText || 'Parepare, Sulawesi Selatan, Indonesia',
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality,
      ...(region ? { addressRegion: region } : {}),
      addressCountry: 'ID',
    },
  };
}

export function buildLlmsTxt(content) {
  const origin = normalizeOrigin(content?.settings?.siteUrl);
  const profile = content?.profile || {};
  const personName = content?.settings?.seoName?.trim() || profile.name || 'Ibrahim Abdullah';
  const locationLabel = resolveLocation(content);
  const city = cityOnly(locationLabel);
  const socials = [
    profile.github && `- GitHub: ${profile.github}`,
    profile.linkedin && `- LinkedIn: ${profile.linkedin}`,
    profile.instagram && `- Instagram: ${profile.instagram}`,
  ].filter(
    (line) =>
      line &&
      !/https:\/\/(github\.com|www\.linkedin\.com|www\.instagram\.com)\/?$/.test(line),
  );
  const lines = [
    `# Portofolio ${personName} — ${city}`,
    '',
    `> ${personName}${profile.firstName && profile.firstName !== personName ? ` (${profile.firstName})` : ''}, ${profile.role || 'Full Stack Developer'} berbasis di ${locationLabel}. Website portofolio resmi: ${origin}/`,
    '',
    '## Ringkasan Profil',
    `- Nama Lengkap: ${personName}`,
    ...(profile.firstName && profile.firstName !== personName
      ? [`- Nama Panggilan / Brand: ${profile.firstName}`]
      : []),
    `- Profesi: ${profile.role || ''}`,
    `- Domisili / Kota: ${locationLabel}`,
    `- Domain Resmi: ${origin}/`,
    `- Email: ${profile.email || ''}`,
    ...socials,
    '',
    '## Tanya-Jawab Singkat (Fakta Resmi)',
    `- Siapa ${personName} dari ${city}? ${personName} adalah seorang ${profile.role || 'Full Stack Developer'} yang berdomisili di ${locationLabel}. ${profile.intro || ''}`,
    `- Apa situs web portofolio resmi ${personName}? Website portofolio resmi ${personName} beralamat di ${origin}/.`,
    `- Bagaimana cara menghubungi ${personName}? Melalui formulir kontak di ${origin}/#contact${profile.email ? ` atau email ${profile.email}` : ''}.`,
    '',
    '## Tentang',
    profile.intro || '',
    profile.about || '',
    profile.aboutMore || '',
    '',
    '## Layanan & Keahlian',
    ...(content?.skills || []).map(
      (s) => `- **${s.title}**: ${s.description} (${(s.tools || []).join(', ')})`,
    ),
    '',
    '## Teknologi Utama',
    ...(content?.frameworks || []).map((f) => `- **${f.name}** (${f.category}): ${f.description}`),
    '',
    '## Pendidikan',
    ...(content?.education || []).map(
      (e) => `- **${e.school}** (${e.period}) — ${e.degree}, ${e.location}`,
    ),
    '',
    '## Karya & Project Pilihan',
    ...(content?.projects || []).map(
      (p) => `- [${p.title}](${origin}/projects/${p.slug}) (${p.category}, ${p.year}): ${p.summary}`,
    ),
  ];
  return lines.filter((line) => line !== undefined).join('\n');
}

export function loadHtmlTemplate() {
  if (HTML_TEMPLATE) return HTML_TEMPLATE;
  if (existsSync(distHtmlPath)) {
    return readFileSync(distHtmlPath, 'utf8');
  }
  return '';
}

function buildLiveHeadAndNoscript({ content, pathname }) {
  const origin = normalizeOrigin(content?.settings?.siteUrl);
  const host = origin.replace(/^https?:\/\//, '');
  const profile = content?.profile || {};
  const settings = content?.settings || {};
  const personName = settings.seoName?.trim() || profile.name || 'Ibrahim Abdullah';
  const locationLabel = resolveLocation(content);
  const city = cityOnly(locationLabel);
  const alternateNames = Array.from(
    new Set([
      profile.name,
      profile.firstName,
      profile.brand,
      city ? `${personName} ${city}` : '',
    ]),
  ).filter((name) => name && name.trim().toLowerCase() !== personName.toLowerCase());

  const cleanPath = (pathname || '/').split('?')[0] || '/';
  const isAdmin = cleanPath.startsWith('/admin');
  const slug = cleanPath.startsWith('/projects/')
    ? cleanPath.slice('/projects/'.length).replace(/\/$/, '')
    : '';
  const project = slug ? (content?.projects || []).find((item) => item.slug === slug) : null;
  const isHome = cleanPath === '/';
  const statusCode = isAdmin || isHome || project ? 200 : 404;

  const initialScript = `<script>window.__INITIAL_CONTENT__=${safeJsonForScript(content)};</script>`;

  if (isAdmin) {
    const head = [
      `<title>${escapeHtml(profile.brand || 'Studio')}. / Studio</title>`,
      `<meta name="robots" content="noindex, nofollow" />`,
      `<meta name="googlebot" content="noindex, nofollow" />`,
      `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
      initialScript,
    ].join('\n  ');
    const noscript = `<main style="max-width:720px;margin:40px auto;padding:24px;font-family:sans-serif;color:#e6eefb;background:#070b12"><h1>Studio Admin</h1><p>Aktifkan JavaScript untuk mengelola konten portfolio.</p></main>`;
    return { statusCode: 200, head, noscript };
  }

  const googleToken = settings.googleVerification?.trim();
  const verificationMeta = googleToken
    ? `<meta name="google-site-verification" content="${escapeHtml(googleToken)}" />`
    : '';

  const personEntity = {
    '@type': 'Person',
    '@id': `${origin}/#person`,
    name: personName,
    ...(alternateNames.length ? { alternateName: alternateNames } : {}),
    url: `${origin}/`,
    mainEntityOfPage: `${origin}/#profilepage`,
    jobTitle: profile.role,
    description: profile.intro,
    image: absoluteMediaUrl(origin, content?.card?.portrait || profile.portrait),
    email: profile.email ? `mailto:${profile.email}` : undefined,
    homeLocation: buildLocationPlace(locationLabel),
    workLocation: buildLocationPlace(locationLabel),
    nationality: {
      '@type': 'Country',
      name: 'Indonesia',
    },
    ...(validSocialLinks(profile).length ? { sameAs: validSocialLinks(profile) } : {}),
    knowsAbout: Array.from(
      new Set([
        ...(content?.skills || []).map((s) => s.title),
        ...(content?.frameworks || []).map((f) => f.name),
      ]),
    ).filter(Boolean),
    alumniOf: (content?.education || [])
      .filter((e) => e.school?.trim())
      .map((e) => ({
        '@type': 'EducationalOrganization',
        name: e.school,
      })),
  };

  if (project) {
    const title = `${project.title} — ${personName} | ${host}`;
    const description = project.summary || (project.description || '').slice(0, 160);
    const canonical = `${origin}/projects/${project.slug}`;
    const image = absoluteMediaUrl(origin, project.image);
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        personEntity,
        {
          '@type': 'CreativeWork',
          name: project.title,
          description: project.description || project.summary,
          url: canonical,
          image,
          datePublished: project.year,
          keywords: (project.tools || []).join(', '),
          author: { '@id': `${origin}/#person` },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
            { '@type': 'ListItem', position: 2, name: 'Projects', item: `${origin}/#projects` },
            { '@type': 'ListItem', position: 3, name: project.title, item: canonical },
          ],
        },
      ],
    };
    const head = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta name="author" content="${escapeHtml(personName)}" />`,
      `<meta name="robots" content="${ROBOT_ALLOW}" />`,
      `<meta name="googlebot" content="${ROBOT_ALLOW}" />`,
      verificationMeta,
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      `<link rel="sitemap" type="application/xml" title="Sitemap" href="${escapeHtml(origin)}/sitemap.xml" />`,
      `<link rel="alternate" type="text/plain" title="AI Summary (llms.txt)" href="${escapeHtml(origin)}/llms.txt" />`,
      `<meta property="og:type" content="article" />`,
      `<meta property="og:site_name" content="${escapeHtml(personName)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
      `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
      `<script id="structured-data-static" type="application/ld+json">${safeJsonForScript(jsonLd)}</script>`,
      initialScript,
    ]
      .filter(Boolean)
      .join('\n  ');
    const noscript = [
      `<main style="max-width:720px;margin:40px auto;padding:24px;font-family:sans-serif;color:#e6eefb;background:#070b12">`,
      `<h1>${escapeHtml(project.title)} — ${escapeHtml(personName)}</h1>`,
      `<p>${escapeHtml(project.summary)}</p>`,
      `<p>${escapeHtml(project.description)}</p>`,
      `<p>Kategori: ${escapeHtml(project.category)} (${escapeHtml(project.year)}) | Tools: ${escapeHtml((project.tools || []).join(', '))}</p>`,
      `</main>`,
    ].join('');
    return { statusCode: 200, head, noscript };
  }

  if (!isHome) {
    const title = `Halaman tidak ditemukan — ${personName}`;
    const head = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="robots" content="noindex, follow" />`,
      `<meta name="googlebot" content="noindex, follow" />`,
      `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
      initialScript,
    ].join('\n  ');
    const noscript = `<main style="max-width:720px;margin:40px auto;padding:24px;font-family:sans-serif;color:#e6eefb;background:#070b12"><h1>404</h1><p>Halaman tidak ditemukan.</p></main>`;
    return { statusCode, head, noscript };
  }

  const title =
    settings.seoTitle?.trim() ||
    `Portofolio ${personName} — ${profile.role || 'Full Stack Developer'}, ${city} | ${host}`;
  const description =
    settings.seoDescription?.trim() ||
    `Portofolio resmi ${personName}${alternateNames[0] ? ` (${alternateNames[0]})` : ''}, ${profile.role || 'Full Stack Developer'} berbasis di ${locationLabel}. ${profile.intro || ''}`;
  const keywords =
    settings.seoKeywords?.trim() ||
    `${personName}, Portofolio ${personName}, ${personName} ${city}, ${host}, ${profile.role || 'Full Stack Developer'}`;
  const canonical = `${origin}/`;
  const image = absoluteMediaUrl(origin, content?.card?.portrait || profile.portrait);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: canonical,
        name: `Portofolio ${personName}`,
        alternateName: [personName, `${personName} ${city}`, host],
        inLanguage: settings.language || 'id',
      },
      personEntity,
      {
        '@type': 'ProfilePage',
        '@id': `${origin}/#profilepage`,
        url: canonical,
        name: `Portofolio Resmi ${personName} — ${city}`,
        isPartOf: { '@id': `${origin}/#website` },
        mainEntity: { '@id': `${origin}/#person` },
      },
      ...(content?.projects?.length
        ? [
            {
              '@type': 'ItemList',
              name: `Selected Works — ${personName}`,
              itemListElement: content.projects.map((item, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: item.title,
                url: `${origin}/projects/${item.slug}`,
              })),
            },
          ]
        : []),
    ],
  };

  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="keywords" content="${escapeHtml(keywords)}" />`,
    `<meta name="author" content="${escapeHtml(personName)}" />`,
    `<meta name="robots" content="${ROBOT_ALLOW}" />`,
    `<meta name="googlebot" content="${ROBOT_ALLOW}" />`,
    verificationMeta,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<link rel="sitemap" type="application/xml" title="Sitemap" href="${escapeHtml(origin)}/sitemap.xml" />`,
    `<link rel="alternate" type="text/plain" title="AI Summary (llms.txt)" href="${escapeHtml(origin)}/llms.txt" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="${escapeHtml(personName)}" />`,
    `<meta property="og:locale" content="id_ID" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(`${personName} — ${profile.role || ''}`)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
    `<script id="structured-data-static" type="application/ld+json">${safeJsonForScript(jsonLd)}</script>`,
    initialScript,
  ]
    .filter(Boolean)
    .join('\n  ');

  const eduList = (content?.education || [])
    .map((e) => `<li>${escapeHtml(e.school)} — ${escapeHtml(e.degree)} (${escapeHtml(e.period)})</li>`)
    .join('');
  const skillList = (content?.skills || [])
    .map(
      (s) =>
        `<li><strong>${escapeHtml(s.title)}</strong>: ${escapeHtml(s.description)} (${escapeHtml((s.tools || []).join(', '))})</li>`,
    )
    .join('');
  const projectList = (content?.projects || [])
    .map(
      (p) =>
        `<li><a href="${escapeHtml(`${origin}/projects/${p.slug}`)}">${escapeHtml(p.title)}</a> — ${escapeHtml(p.summary)}</li>`,
    )
    .join('');

  const noscript = [
    `<main style="max-width:760px;margin:40px auto;padding:24px;font-family:sans-serif;color:#e6eefb;background:#070b12;line-height:1.7">`,
    `<h1>Portofolio ${escapeHtml(personName)}${alternateNames[0] ? ` (${escapeHtml(alternateNames[0])})` : ''} — ${escapeHtml(profile.role || 'Full Stack Developer')}, ${escapeHtml(city)}</h1>`,
    `<p>${escapeHtml(personName)} adalah seorang ${escapeHtml(profile.role || 'Full Stack Developer')} yang berdomisili di ${escapeHtml(locationLabel)}.</p>`,
    `<p>${escapeHtml(profile.intro || '')}</p>`,
    `<p>${escapeHtml(profile.about || '')} ${escapeHtml(profile.aboutMore || '')}</p>`,
    `<p>Website portofolio resmi: <a href="${escapeHtml(canonical)}">${escapeHtml(canonical)}</a>${profile.email ? ` | Email: ${escapeHtml(profile.email)}` : ''}</p>`,
    eduList ? `<h2>Pendidikan</h2><ul>${eduList}</ul>` : '',
    skillList ? `<h2>Keahlian &amp; Layanan</h2><ul>${skillList}</ul>` : '',
    projectList ? `<h2>Project Pilihan</h2><ul>${projectList}</ul>` : '',
    `</main>`,
  ].join('');

  return { statusCode: 200, head, noscript };
}

export function renderDocumentHtml({ templateHtml, content, pathname }) {
  const { statusCode, head, noscript } = buildLiveHeadAndNoscript({ content, pathname });
  let html = templateHtml;

  const startMarker = '<meta name="seo-head-start" content="1"';
  const endMarker = '<meta name="seo-head-end" content="1"';
  const startIdx = html.indexOf(startMarker);
  const endMarkerIdx = html.indexOf(endMarker);
  if (startIdx !== -1 && endMarkerIdx !== -1) {
    const endClose = html.indexOf('>', endMarkerIdx);
    if (endClose !== -1) {
      html = `${html.slice(0, startIdx)}${head}${html.slice(endClose + 1)}`;
    }
  } else {
    const headClose = html.indexOf('</head>');
    if (headClose !== -1) {
      html = `${html.slice(0, headClose)}${head}\n</head>${html.slice(headClose + 7)}`;
    }
  }

  const nsStart = html.lastIndexOf('<noscript>');
  const nsEnd = nsStart !== -1 ? html.indexOf('</noscript>', nsStart) : -1;
  if (nsStart !== -1 && nsEnd !== -1) {
    html = `${html.slice(0, nsStart)}<noscript>${noscript}</noscript>${html.slice(nsEnd + 11)}`;
  }

  return { statusCode, html };
}
