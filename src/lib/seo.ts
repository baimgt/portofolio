import type { Content, Project } from '../types';

const DEFAULT_ORIGIN = 'https://ibrahimabdullah.biz.id';
const ROBOT_ALLOW = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement('meta');
    document.head.appendChild(node);
  }
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
}

function removeNode(selector: string) {
  document.head.querySelector(selector)?.remove();
}

function upsertLink(rel: string, href: string) {
  let node = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

function upsertJsonLd(id: string, payload: unknown | null) {
  const existing = document.getElementById(id);
  if (!payload) {
    existing?.remove();
    return;
  }
  const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(payload);
  if (!existing) document.head.appendChild(script);
}

function normalizeOrigin(siteUrl?: string): string {
  const clean = (siteUrl || DEFAULT_ORIGIN).trim().replace(/\/+$/, '');
  return /^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(clean) ? clean : DEFAULT_ORIGIN;
}

function absoluteMediaUrl(origin: string, url?: string): string {
  if (!url) return `${origin}/images/portrait.webp`;
  if (/^https?:\/\//.test(url)) return url;
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export function validSocialLinks(content: Content): string[] {
  return [content.profile.github, content.profile.instagram, content.profile.linkedin].filter(
    (url) =>
      typeof url === 'string' &&
      /^https:\/\/[^\s]+$/.test(url) &&
      !/^https:\/\/(github\.com|www\.instagram\.com|www\.linkedin\.com)\/?$/.test(url),
  );
}

export function resolvePublicPersonName(content: Content): string {
  return content.settings?.seoName?.trim() || content.profile.name;
}

export function resolvePublicLocation(content: Content): string {
  const seoLoc = content.settings?.seoLocation?.trim();
  const profLoc = content.profile.location?.trim();
  if (seoLoc && (!profLoc || profLoc.toLowerCase() === 'indonesia')) return seoLoc;
  if (profLoc && seoLoc && !profLoc.toLowerCase().includes(seoLoc.split(',')[0].trim().toLowerCase())) {
    return seoLoc;
  }
  return profLoc || seoLoc || 'Parepare, Sulawesi Selatan, Indonesia';
}

export function resolvePublicCity(content: Content): string {
  return resolvePublicLocation(content).split(',')[0].trim() || 'Parepare';
}

function buildLocationPlace(locationText: string) {
  const parts = locationText
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const locality = parts[0] || 'Parepare';
  const region =
    parts.length >= 3
      ? parts[1]
      : parts.length === 2 && !/^indonesia$/i.test(parts[1])
        ? parts[1]
        : undefined;
  return {
    '@type': 'Place',
    name: locationText,
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality,
      ...(region ? { addressRegion: region } : {}),
      addressCountry: 'ID',
    },
  };
}

export function syncSeoMetadata({
  content,
  route,
  project,
}: {
  content: Content;
  route: string;
  project?: Project;
}) {
  if (typeof document === 'undefined') return;

  const isAdmin = route.startsWith('/admin');
  const origin = normalizeOrigin(content.settings?.siteUrl);
  const host = origin.replace(/^https?:\/\//, '');
  const personName = resolvePublicPersonName(content);
  const locationLabel = resolvePublicLocation(content);
  const city = resolvePublicCity(content);

  if (isAdmin) {
    document.title = `${content.profile.brand}. / Studio`;
    upsertMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, nofollow' });
    upsertMeta('meta[name="googlebot"]', { name: 'googlebot', content: 'noindex, nofollow' });
    upsertJsonLd('structured-data-static', null);
    return;
  }

  const alternateNames = Array.from(
    new Set([
      content.profile.name,
      content.profile.firstName,
      content.profile.brand,
      city ? `${personName} ${city}` : '',
    ]),
  ).filter((name) => name && name.trim().toLowerCase() !== personName.toLowerCase());

  const googleToken = content.settings?.googleVerification?.trim();
  if (googleToken) {
    upsertMeta('meta[name="google-site-verification"]', {
      name: 'google-site-verification',
      content: googleToken,
    });
  } else {
    removeNode('meta[name="google-site-verification"]');
  }

  upsertLink('sitemap', `${origin}/sitemap.xml`);
  upsertLink('alternate', `${origin}/llms.txt`);

  const personEntity = {
    '@type': 'Person',
    '@id': `${origin}/#person`,
    name: personName,
    ...(alternateNames.length ? { alternateName: alternateNames } : {}),
    url: `${origin}/`,
    mainEntityOfPage: `${origin}/#profilepage`,
    jobTitle: content.profile.role,
    description: content.profile.intro,
    image: absoluteMediaUrl(origin, content.card?.portrait || content.profile.portrait),
    email: content.profile.email ? `mailto:${content.profile.email}` : undefined,
    homeLocation: buildLocationPlace(locationLabel),
    workLocation: buildLocationPlace(locationLabel),
    nationality: {
      '@type': 'Country',
      name: 'Indonesia',
    },
    ...(validSocialLinks(content).length ? { sameAs: validSocialLinks(content) } : {}),
    knowsAbout: Array.from(
      new Set([
        ...content.skills.map((skill) => skill.title),
        ...content.frameworks.map((fw) => fw.name),
      ]),
    ).filter(Boolean),
    alumniOf: content.education
      .filter((item) => item.school.trim())
      .map((item) => ({
        '@type': 'EducationalOrganization',
        name: item.school,
      })),
  };

  if (route === '/') {
    const title =
      content.settings?.seoTitle?.trim() ||
      `Portofolio ${personName} — ${content.profile.role}, ${city} | ${host}`;
    const description =
      content.settings?.seoDescription?.trim() ||
      `Portofolio resmi ${personName}${alternateNames[0] ? ` (${alternateNames[0]})` : ''}, ${content.profile.role} berbasis di ${locationLabel}. ${content.profile.intro}`;
    const rawKeywords = content.settings?.seoKeywords?.trim() || '';
    const extraTokens = [
      personName,
      `Portofolio ${personName}`,
      `${personName} ${city}`,
      host,
      content.profile.role || 'Full Stack Developer',
    ].filter((tok) => tok && !rawKeywords.toLowerCase().includes(tok.toLowerCase()));
    const keywords = rawKeywords
      ? [rawKeywords, ...extraTokens].join(', ')
      : extraTokens.join(', ');
    const image = absoluteMediaUrl(origin, content.card?.portrait || content.profile.portrait);
    const canonical = `${origin}/`;

    document.title = title;
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="keywords"]', { name: 'keywords', content: keywords });
    upsertMeta('meta[name="author"]', { name: 'author', content: personName });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: ROBOT_ALLOW });
    upsertMeta('meta[name="googlebot"]', { name: 'googlebot', content: ROBOT_ALLOW });
    upsertLink('canonical', canonical);

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'profile' });
    upsertMeta('meta[property="og:site_name"]', {
      property: 'og:site_name',
      content: `Portofolio ${personName}`,
    });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });

    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });

    upsertJsonLd('structured-data-static', {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          url: canonical,
          name: `Portofolio ${personName}`,
          alternateName: [personName, `${personName} ${city}`, host],
          inLanguage: content.settings?.language || 'id',
        },
        {
          '@type': 'ImageObject',
          '@id': `${origin}/#primaryimage`,
          url: image,
          contentUrl: image,
          caption: `Foto resmi ${personName} — ${content.profile.role}, ${city}`,
        },
        personEntity,
        {
          '@type': 'ProfilePage',
          '@id': `${origin}/#profilepage`,
          url: canonical,
          name: `Portofolio Resmi ${personName} — ${city}`,
          isPartOf: { '@id': `${origin}/#website` },
          primaryImageOfPage: { '@id': `${origin}/#primaryimage` },
          mainEntity: { '@id': `${origin}/#person` },
        },
        ...(content.projects.length
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
    });
    return;
  }

  if (project) {
    const title = `${project.title} — ${personName} | ${host}`;
    const description = project.summary || project.description.slice(0, 160);
    const canonical = `${origin}/projects/${project.slug}`;
    const image = absoluteMediaUrl(origin, project.image);

    document.title = title;
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: ROBOT_ALLOW });
    upsertMeta('meta[name="googlebot"]', { name: 'googlebot', content: ROBOT_ALLOW });
    upsertLink('canonical', canonical);

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });

    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });

    upsertJsonLd('structured-data-static', {
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
          keywords: project.tools.join(', '),
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
    });
    return;
  }

  document.title = `Halaman tidak ditemukan — ${personName}`;
  upsertMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, follow' });
  upsertMeta('meta[name="googlebot"]', { name: 'googlebot', content: 'noindex, follow' });
}
