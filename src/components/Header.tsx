import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, Moon, Sun, Volume2, VolumeX, X } from 'lucide-react';
import gsap from 'gsap';
import type { Navigate, Profile } from '../types';
import LanguageSwitcher from './LanguageSwitcher';
import { reducedMotion, smoothScrollTo } from './Motion';
import { useSoundEnabled } from '../lib/sound';

const links = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'projects', label: 'Projects' },
  { id: 'contact', label: 'Contact' },
];

export default function Header({
  profile,
  copy,
  isHome,
  navigate,
  language,
  onLanguage,
}: {
  language?: string;
  onLanguage?: (code: string) => void;
  profile: Profile;
  copy: Record<string, string>;
  isHome: boolean;
  navigate: Navigate;
}) {
  const [active, setActive] = useState('home');
  const [open, setOpen] = useState(false);
  const [light, setLight] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [soundOn, toggleSound] = useSoundEnabled();
  const [pill, setPill] = useState({ left: 0, width: 0, visible: false });

  const menuRef = useRef<HTMLDialogElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const navigationLinks = links.map((link) => ({
    ...link,
    label: copy[`nav${link.id[0].toUpperCase()}${link.id.slice(1)}`] || link.label,
  }));

  const syncPill = useCallback(() => {
    const target = active ? linkRefs.current[active] : null;
    if (!target || !navRef.current) {
      setPill((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const left = target.offsetLeft;
    const width = target.offsetWidth;
    setPill((prev) =>
      prev.left === left && prev.width === width && prev.visible
        ? prev
        : { left, width, visible: true },
    );
  }, [active]);

  useLayoutEffect(() => {
    syncPill();
  }, [syncPill, language, copy.navHome, copy.navAbout, copy.navProjects, copy.navContact]);

  useEffect(() => {
    const onResize = () => syncPill();
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(syncPill).catch(() => {});
    return () => window.removeEventListener('resize', onResize);
  }, [syncPill]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = window.scrollY > 24;
        setScrolled((prev) => (prev === next ? prev : next));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!isHome) {
      setActive('');
      return;
    }
    let raf = 0;
    const syncActiveSection = () => {
      raf = 0;
      const threshold = window.innerHeight * 0.42;
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
      if (nearBottom) {
        setActive('contact');
        return;
      }
      let current = 'home';
      for (const link of links) {
        const section = document.getElementById(link.id);
        if (section && section.getBoundingClientRect().top <= threshold) {
          current = link.id;
        }
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const scheduleSync = () => {
      if (!raf) raf = requestAnimationFrame(syncActiveSection);
    };
    syncActiveSection();
    window.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(document.body);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      resizeObserver.disconnect();
    };
  }, [isHome]);

  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    return () => {
      document.documentElement.dataset.theme = 'dark';
    };
  }, [light]);

  useEffect(() => {
    if (open) {
      menuRef.current?.showModal();
      const before = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (!reducedMotion())
        gsap.fromTo(
          '.mobile-menu-link',
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.065, duration: 0.6, ease: 'power3.out' },
        );
      return () => {
        document.documentElement.style.overflow = before;
      };
    }
    menuRef.current?.close();
  }, [open]);

  const href = (id: string) => (isHome ? `#${id}` : `/#${id}`);
  const follow = (event: React.MouseEvent, id: string) => {
    const wasOpen = open;
    setOpen(false);
    if (!isHome) {
      event.preventDefault();
      navigate(`/#${id}`);
      return;
    }
    event.preventDefault();
    const scrollTarget = id === 'home' ? 0 : `#${id}`;
    if (wasOpen) {
      requestAnimationFrame(() => smoothScrollTo(scrollTarget));
    } else {
      smoothScrollTo(scrollTarget);
    }
    window.history.replaceState(null, '', id === 'home' ? '/' : `#${id}`);
  };

  const handleNavPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || !navRef.current) return;
    const rect = navRef.current.getBoundingClientRect();
    navRef.current.style.setProperty('--glass-x', `${event.clientX - rect.left}px`);
    navRef.current.style.setProperty('--glass-y', `${event.clientY - rect.top}px`);
    navRef.current.style.setProperty('--glass-hover', '1');
  };

  return (
    <>
      <header className="site-header" data-scrolled={scrolled ? 'true' : 'false'}>
        <a
          href="/"
          className="wordmark"
          aria-label={`${profile.brand} - Home`}
          onClick={(event) => {
            if (!isHome) {
              event.preventDefault();
              navigate('/');
            } else {
              event.preventDefault();
              smoothScrollTo(0);
            }
          }}
        >
          {profile.brand}
          <span>.</span>
        </a>
        <nav
          ref={navRef}
          className="desktop-nav liquid-glass"
          aria-label="Navigasi utama"
          onPointerMove={handleNavPointerMove}
          onPointerLeave={() => navRef.current?.style.setProperty('--glass-hover', '0')}
        >
          <span
            className={`nav-liquid-pill ${pill.visible ? 'is-visible' : ''}`}
            aria-hidden="true"
            style={{
              width: `${pill.width}px`,
              transform: `translate3d(${pill.left}px, 0, 0)`,
            }}
          />
          {navigationLinks.map((link) => (
            <a
              key={link.id}
              ref={(node) => {
                linkRefs.current[link.id] = node;
              }}
              className={`nav-link ${active === link.id ? 'active' : ''}`}
              href={href(link.id)}
              onClick={(event) => follow(event, link.id)}
            >
              <span>{link.label}</span>
              {active === link.id && <span className="nav-dot" />}
            </a>
          ))}
          <span className="nav-divider" />
          <button
            type="button"
            className="theme-button"
            onClick={() => setLight((value) => !value)}
            aria-label={light ? 'Gunakan tema gelap' : 'Gunakan tema terang'}
            title={light ? 'Dark mode' : 'Light mode'}
          >
            {light ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            type="button"
            className={`sound-toggle ${soundOn ? 'is-on' : ''}`}
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Matikan suara' : 'Nyalakan suara'}
            title={soundOn ? 'Suara: ON' : 'Suara: OFF'}
          >
            <span className="sound-icon-wrap" aria-hidden="true">
              {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
              {soundOn && (
                <span className="sound-waves">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </span>
            <span className="sound-label">{soundOn ? 'ON' : 'OFF'}</span>
          </button>
          {language && onLanguage && <LanguageSwitcher current={language} onSelect={onLanguage} />}
        </nav>
        <a
          href={href('contact')}
          className="header-contact"
          onClick={(event) => follow(event, 'contact')}
        >
          {copy.heroContact} <ArrowUpRight size={16} />
        </a>
        <div className="mobile-header-actions">
          <button
            type="button"
            className="mobile-theme-toggle"
            onClick={() => setLight((value) => !value)}
            aria-label={light ? 'Mode gelap' : 'Mode terang'}
            title={light ? 'Dark mode' : 'Light mode'}
          >
            {light ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            type="button"
            className={`mobile-sound-toggle ${soundOn ? 'is-on' : ''}`}
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Matikan suara' : 'Nyalakan suara'}
            title={soundOn ? 'Suara: ON' : 'Suara: OFF'}
          >
            <span className="sound-icon-wrap" aria-hidden="true">
              {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
              {soundOn && (
                <span className="sound-waves">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </span>
            <span className="sound-label">{soundOn ? 'ON' : 'OFF'}</span>
          </button>
          <button
            className="mobile-menu-toggle icon-button"
            aria-label="Buka menu navigasi"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      <dialog
        ref={menuRef}
        className="mobile-menu"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        data-lenis-prevent
      >
        <div className="mobile-menu-shell">
          <div className="mobile-menu-top liquid-glass">
            <a
              className="wordmark"
              href="/"
              onClick={(event) => follow(event, 'home')}
            >
              {profile.brand}
              <span>.</span>
            </a>
            <button
              className="icon-button mobile-menu-close"
              aria-label="Tutup navigasi"
              onClick={() => setOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="mobile-menu-body">
            <span className="mobile-menu-eyebrow">NAVIGATION</span>
            <nav aria-label="Navigasi mobile">
              {navigationLinks.map((link, index) => (
                <a
                  key={link.id}
                  className={`mobile-menu-link ${active === link.id ? 'active' : ''}`}
                  href={href(link.id)}
                  onClick={(event) => follow(event, link.id)}
                >
                  <span>0{index + 1}</span>
                  <strong>{link.label}</strong>
                  <span className="mobile-link-arrow" aria-hidden="true">
                    <ArrowUpRight size={18} />
                  </span>
                </a>
              ))}
            </nav>
            <div className="mobile-menu-footer">
              <div className="mobile-menu-controls">
                <button
                  type="button"
                  className="mobile-drawer-pill"
                  onClick={() => setLight((value) => !value)}
                >
                  {light ? <Moon size={16} /> : <Sun size={16} />}
                  <span>{light ? 'Dark mode' : 'Light mode'}</span>
                </button>
                <button
                  type="button"
                  className={`mobile-drawer-pill mobile-sound-drawer-toggle ${soundOn ? 'is-on' : ''}`}
                  onClick={toggleSound}
                  aria-pressed={soundOn}
                >
                  {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  <span>{soundOn ? 'Sound: ON' : 'Sound: OFF'}</span>
                </button>
              </div>
              {language && onLanguage && (
                <LanguageSwitcher current={language} onSelect={onLanguage} variant="mobile" />
              )}
              <a className="mobile-menu-email" href={`mailto:${profile.email}`}>
                <div>
                  <span>GET IN TOUCH</span>
                  <strong>{profile.email}</strong>
                </div>
                <span className="mobile-link-arrow" aria-hidden="true">
                  <ArrowUpRight size={16} />
                </span>
              </a>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
