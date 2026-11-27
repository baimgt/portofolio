import { CircleHelp, ExternalLink, Globe, Search } from 'lucide-react';
import { Field } from './Fields';
import type { AppSettings, Profile } from '../../types';

function extractVerificationToken(raw: string): string {
  const trimmed = raw.trim();
  const match = /content\s*=\s*["']([^"']+)["']/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

export function SeoEditor({
  value,
  profile,
  onChange,
}: {
  value: AppSettings;
  profile: Profile;
  onChange: (value: AppSettings) => void;
}) {
  const siteUrl = (value.siteUrl ?? 'https://ibrahimabdullah.biz.id').trim() || 'https://ibrahimabdullah.biz.id';
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const seoName = value.seoName ?? 'Ibrahim Abdullah';
  const seoTitle = value.seoTitle ?? '';
  const seoDescription = value.seoDescription ?? '';
  const seoKeywords = value.seoKeywords ?? '';
  const googleVerification = value.googleVerification ?? '';

  const previewTitle = seoTitle.trim() || `${seoName || profile.name} — ${profile.role} | ${host}`;
  const previewDesc =
    seoDescription.trim() ||
    `${seoName || profile.name} (${profile.name}) — ${profile.role} di ${profile.location}. ${profile.intro}`.slice(
      0,
      160,
    );

  return (
    <>
      <div className="admin-section-title">
        <Search size={20} />
        <div>
          <h2>SEO, Google Search &amp; AI Overviews.</h2>
          <p>
            Atur identitas resmi di hasil pencarian Google, Schema.org Person/ProfilePage, sitemap
            otomatis, dan file ringkasan AI (/llms.txt).
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
          <h3>Identitas &amp; Domain Resmi</h3>
          <div className="admin-form-grid">
            <Field
              label="Nama lengkap resmi (untuk Google & AI)"
              hint="Ditampilkan pada JSON-LD Person, title, footer, dan Google AI Overview."
            >
              <input
                value={seoName}
                maxLength={120}
                placeholder="Ibrahim Abdullah"
                onChange={(event) => onChange({ ...value, seoName: event.target.value })}
              />
            </Field>
            <Field
              label="Domain utama (Canonical URL)"
              hint="Gunakan HTTPS tanpa garis miring di akhir. Contoh: https://ibrahimabdullah.biz.id"
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
              hint="Kosongkan untuk otomatis memakai Nama Lengkap — Role | Domain."
              wide
            >
              <input
                value={seoTitle}
                maxLength={200}
                placeholder={`${seoName || profile.name} — ${profile.role} | ${host}`}
                onChange={(event) => onChange({ ...value, seoTitle: event.target.value })}
              />
            </Field>
            <Field
              label={`Deskripsi di Google (${seoDescription.length}/160 disarankan)`}
              hint="Kosongkan untuk otomatis memakai ringkasan profil + lokasi + keahlian."
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
                placeholder="Ibrahim Abdullah, ibrahimabdullah.biz.id, Full Stack Developer, Web Developer"
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
            <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="button secondary small">
              /robots.txt <ExternalLink size={13} />
            </a>
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="button secondary small">
              /sitemap.xml <ExternalLink size={13} />
            </a>
            <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="button secondary small">
              /llms.txt (AI Summary) <ExternalLink size={13} />
            </a>
          </div>
          <p className="admin-info-note">
            <CircleHelp size={16} />
            Agar nama <strong>{seoName || profile.name}</strong> dan domain <code>{host}</code> cepat
            diindeks Google Search serta dikutip Google AI Overviews, daftarkan domain di{' '}
            <strong>Google Search Console</strong> lalu kirimkan <code>{siteUrl}/sitemap.xml</code>,
            dan lengkapi tautan GitHub, LinkedIn, serta Instagram asli kamu di tab{' '}
            <strong>Informasi kontak</strong> agar Google menghubungkan entitas akun sosialmu.
          </p>
        </div>
      </div>
    </>
  );
}
