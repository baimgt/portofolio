import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, Globe, Search } from 'lucide-react';
import { Field } from './Fields';
import { resolvePublicCity, resolvePublicLocation, validSocialLinks } from '../../lib/seo';
import type { AppSettings, Content, Profile } from '../../types';

function extractVerificationToken(raw: string): string {
  const trimmed = raw.trim();
  const match = /content\s*=\s*["']([^"']+)["']/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

export function SeoEditor({
  value,
  profile,
  content,
  onChange,
}: {
  value: AppSettings;
  profile: Profile;
  content: Content;
  onChange: (value: AppSettings) => void;
}) {
  const siteUrl =
    (value.siteUrl ?? 'https://ibrahimabdullah.biz.id').trim() ||
    'https://ibrahimabdullah.biz.id';
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const seoName = value.seoName ?? 'Ibrahim Abdullah';
  const seoLocation = value.seoLocation ?? 'Parepare, Sulawesi Selatan, Indonesia';
  const seoTitle = value.seoTitle ?? '';
  const seoDescription = value.seoDescription ?? '';
  const seoKeywords = value.seoKeywords ?? '';
  const googleVerification = value.googleVerification ?? '';

  const effectiveLocation = resolvePublicLocation(content);
  const city = resolvePublicCity(content);
  const previewTitle =
    seoTitle.trim() || `Portofolio ${seoName || profile.name} — ${profile.role}, ${city} | ${host}`;
  const previewDesc =
    seoDescription.trim() ||
    `Portofolio resmi ${seoName || profile.name} (${profile.name}), ${profile.role} berbasis di ${effectiveLocation}. ${profile.intro}`.slice(
      0,
      160,
    );

  const realSocialCount = validSocialLinks(content).length;
  const hasDummyEmail = profile.email === 'hello@Baim.dev';
  const hasDummySchool = content.education.some((e) =>
    /Universitas Nusantara|SMK Teknologi Nusantara|SMP Nusantara/i.test(e.school),
  );
  const hasCustomPortrait = (content.card?.portrait || profile.portrait || '').startsWith('/uploads/');

  const checks = [
    {
      ok: Boolean(seoName.trim()) && seoLocation.toLowerCase().includes('parepare'),
      text: `Entitas nama (${seoName || profile.name}) dan domisili lokal (${effectiveLocation}) aktif di Title, Schema Person, dan teks halaman.`,
    },
    {
      ok: realSocialCount > 0,
      text:
        realSocialCount > 0
          ? `${realSocialCount} profil sosial asli terhubung ke JSON-LD sameAs.`
          : 'GitHub / LinkedIn / Instagram di tab Informasi kontak masih kosong/default. Isi tautan profil aslimu agar Google AI & Search mengenali entitas Ibrahim Abdullah Parepare.',
    },
    {
      ok: !hasDummyEmail && !hasDummySchool,
      text:
        !hasDummyEmail && !hasDummySchool
          ? 'Email kontak dan riwayat pendidikan sudah memakai data asli (tidak ada data contoh).'
          : 'Email atau Riwayat sekolah masih berisi contoh template (hello@Baim.dev / Universitas Nusantara). Ganti di tab terkait agar Google AI tidak mengutip data contoh.',
    },
    {
      ok: hasCustomPortrait,
      text: hasCustomPortrait
        ? 'Foto profil kustom sudah terunggah (/uploads/...) dan langsung terpasang pada meta og:image & SSR.'
        : 'Masih memakai foto bawaan (/images/portrait.webp). Unggah foto aslimu di tab Profil saya jika belum.',
    },
  ];

  return (
    <>
      <div className="admin-section-title">
        <Search size={20} />
        <div>
          <h2>SEO, Google Search &amp; AI Overviews.</h2>
          <p>
            Atur identitas resmi untuk pencarian &ldquo;Ibrahim Abdullah&rdquo;, &ldquo;Ibrahim
            Abdullah Parepare&rdquo;, dan &ldquo;Portofolio Ibrahim Abdullah&rdquo;.
          </p>
        </div>
      </div>

      <div className="admin-sound-stack">
        <div className="admin-serp-preview" aria-label="Pratinjau hasil pencarian Google">
          <span className="eyebrow">PRATINJAU GOOGLE SEARCH</span>
          <div className="serp-url">
            <Globe size={13} />
            <span>{siteUrl}</span>
          </div>
          <h3>{previewTitle}</h3>
          <p>{previewDesc}</p>
        </div>

        <div className="admin-editor-section">
          <h3>Status Kesiapan Google #1 &amp; AI Overviews</h3>
          <div className="admin-seo-checklist">
            {checks.map((item) => (
              <div key={item.text} className={`seo-check-row ${item.ok ? 'ok' : 'warn'}`}>
                {item.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-editor-section">
          <h3>Identitas, Kota &amp; Domain Resmi</h3>
          <div className="admin-form-grid">
            <Field
              label="Nama lengkap resmi (untuk Google & AI)"
              hint="Ditampilkan pada JSON-LD Person, title, about, footer, dan Google AI Overview."
            >
              <input
                value={seoName}
                maxLength={120}
                placeholder="Ibrahim Abdullah"
                onChange={(event) => onChange({ ...value, seoName: event.target.value })}
              />
            </Field>
            <Field
              label="Domisili / Kota (untuk SEO Lokal & AI)"
              hint="Misal: Parepare, Sulawesi Selatan, Indonesia — membantu query 'Ibrahim Abdullah Parepare'."
            >
              <input
                value={seoLocation}
                maxLength={160}
                placeholder="Parepare, Sulawesi Selatan, Indonesia"
                onChange={(event) => onChange({ ...value, seoLocation: event.target.value })}
              />
            </Field>
            <Field
              label="Domain utama (Canonical URL)"
              hint="Harus sama persis dengan Primary Domain di Vercel (misal https://www.ibrahimabdullah.biz.id atau https://ibrahimabdullah.biz.id)."
              wide
            >
              <input
                type="url"
                value={value.siteUrl ?? 'https://ibrahimabdullah.biz.id'}
                maxLength={300}
                placeholder="https://ibrahimabdullah.biz.id"
                onChange={(event) => onChange({ ...value, siteUrl: event.target.value })}
              />
            </Field>
            <Field
              label="Judul khusus di Google (opsional)"
              hint="Kosongkan untuk otomatis memakai Portofolio Nama Lengkap — Role, Kota | Domain."
              wide
            >
              <input
                value={seoTitle}
                maxLength={200}
                placeholder={previewTitle}
                onChange={(event) => onChange({ ...value, seoTitle: event.target.value })}
              />
            </Field>
            <Field
              label={`Deskripsi di Google (${seoDescription.length}/160 disarankan)`}
              hint="Kosongkan untuk otomatis memakai ringkasan profil + kota + keahlian."
              wide
            >
              <textarea
                rows={3}
                value={seoDescription}
                maxLength={500}
                placeholder={previewDesc}
                onChange={(event) => onChange({ ...value, seoDescription: event.target.value })}
              />
            </Field>
            <Field label="Kata kunci &amp; topik keahlian" wide>
              <input
                value={seoKeywords}
                maxLength={500}
                placeholder="Ibrahim Abdullah, Portofolio Ibrahim Abdullah, Ibrahim Abdullah Parepare"
                onChange={(event) => onChange({ ...value, seoKeywords: event.target.value })}
              />
            </Field>
            <Field
              label="Token verifikasi Google Search Console (opsional)"
              hint="Boleh tempel token saja atau seluruh tag <meta name='google-site-verification' ...>. Untuk verifikasi instan paling disarankan memakai DNS TXT record di domain biz.id."
              wide
            >
              <input
                value={googleVerification}
                maxLength={200}
                placeholder="contoh: abcdef123456_token..."
                onChange={(event) =>
                  onChange({
                    ...value,
                    googleVerification: extractVerificationToken(event.target.value),
                  })
                }
              />
            </Field>
          </div>
        </div>

        <div className="admin-editor-section">
          <h3>Endpoint Otomatis untuk Bot Google &amp; AI</h3>
          <div className="admin-seo-links">
            <a
              href="/robots.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="button secondary small"
            >
              /robots.txt <ExternalLink size={13} />
            </a>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="button secondary small"
            >
              /sitemap.xml <ExternalLink size={13} />
            </a>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="button secondary small"
            >
              /llms.txt (AI Summary) <ExternalLink size={13} />
            </a>
          </div>
          <p className="admin-info-note">
            <CircleHelp size={16} />
            Kode tidak bisa memaksa peringkat #1 tanpa otoritas eksternal. Setelah semua data asli
            disimpan: (1) sambungkan tautan <code>{siteUrl}</code> di bio GitHub, LinkedIn, dan
            Instagram Anda dengan nama <strong>{seoName || profile.name} Parepare</strong>, (2)
            kirim <code>{siteUrl}/sitemap.xml</code> di Google Search Console, lalu klik{' '}
            <strong>Request Indexing</strong> pada halaman utama.
          </p>
        </div>
      </div>
    </>
  );
}
