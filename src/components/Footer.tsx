import { useState } from 'react';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import Signature from './Signature';
import { Github, Instagram, Linkedin } from './BrandIcons';
import { smoothScrollTo } from './Motion';
import { resolvePublicCity, resolvePublicPersonName } from '../lib/seo';
import type { Content, Navigate } from '../types';

export default function Footer({ content, navigate }: { content: Content; navigate: Navigate }) {
  const { profile, pages } = content;
  const publicName = resolvePublicPersonName(content);
  const publicCity = resolvePublicCity(content);
  const copyrightName =
    publicName && !profile.name.toLowerCase().includes(publicName.toLowerCase())
      ? `${publicName} (${profile.name})`
      : profile.name;
  const [signing, setSigning] = useState(false);
  return (
    <footer className="site-footer" id="footer">
      <div className="container">
        <div className="footer-top">
          <p>{pages.footerNote}</p>
          <div className="footer-social">
            {[
              { name: 'Instagram', url: profile.instagram, icon: Instagram },
              { name: 'GitHub', url: profile.github, icon: Github },
              { name: 'LinkedIn', url: profile.linkedin, icon: Linkedin },
            ]
              .filter((item) => !!item.url)
              .map(({ name, url, icon: Icon }) => (
                <a
                  key={name}
                  className="animated-link"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon size={14} />
                  {name}
                  <ArrowUpRight size={14} />
                </a>
              ))}
          </div>
          <button
            className="back-to-top"
            aria-label="Kembali ke atas"
            onClick={() => smoothScrollTo(0)}
          >
            <ArrowUp size={20} />
          </button>
        </div>
        <div
          className={`footer-wordmark-wrap${signing ? ' is-signing' : ''}`}
          onMouseMove={() => !signing && setSigning(true)}
          onMouseLeave={() => setSigning(false)}
        >
          <a
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigate('/');
            }}
            className="footer-wordmark"
            aria-label="Home"
          >
            {profile.brand}
            <span>.</span>
          </a>
          <Signature
            className="footer-signature"
            text={pages.signatureText || profile.name}
            image={pages.signatureImage}
          />
          <span className="footer-signoff">{content.copy.footerSignoff}</span>
        </div>
        <div className="footer-bottom">
          <span>
            &copy; {new Date().getFullYear()} Portofolio {copyrightName} · {publicCity}
          </span>
          <span>{content.copy.footerCredit}</span>
          <a
            href="/admin"
            onClick={(event) => {
              event.preventDefault();
              navigate('/admin');
            }}
          >
            {content.copy.footerAdmin} <ArrowUpRight size={11} />
          </a>
        </div>
      </div>
    </footer>
  );
}
