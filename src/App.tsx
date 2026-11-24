import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import seed from '../shared/content.json';
import type { Content } from './types';
import { api } from './lib/api';
import Header from './components/Header';
import { applyLanguage, effectiveLanguage } from './lib/i18n';
import { PageLoader, reducedMotion } from './components/Motion';
import Portfolio from './pages/Portfolio';
import ProjectDetail from './pages/ProjectDetail';

const Admin = lazy(() => import('./pages/Admin'));

export default function App() {
  const [content, setContent] = useState<Content>(seed as Content);
  const [route, setRoute] = useState(window.location.pathname);
  const [loading, setLoading] = useState(!window.location.pathname.startsWith('/admin'));
  const overlay = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);
  const entranceDelay = useRef(loading ? 0.82 : 0);
  const refresh = useCallback(async () => {
    try {
      const latest = await api<Content>('/content');
      setContent((current) =>
        JSON.stringify(current) === JSON.stringify(latest) ? current : latest,
      );
    } catch (error) {
      console.warn(
        'Content synchronization unavailable:',
        error instanceof Error ? error.message : error,
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 45000);
    window.addEventListener('focus', refresh);
    const pop = () => {
      entranceDelay.current = 0;
      setRoute(window.location.pathname);
      setTimeout(() => {
        const target = window.location.hash
          ? document.getElementById(window.location.hash.slice(1))
          : null;
        if (target) target.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo(0, 0);
      }, 100);
    };
    window.addEventListener('popstate', pop);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('popstate', pop);
    };
  }, [refresh]);
  useEffect(() => {
    document.title = route.startsWith('/admin')
      ? `${content.profile.brand}. / Studio`
      : `${content.profile.name} - ${content.profile.role}`;
  }, [content.profile, route]);
  const navigate = useCallback((to: string) => {
    if (navigating.current) return;
    const target = new URL(to, window.location.origin);
    if (target.pathname === window.location.pathname) {
      if (target.hash)
        document
          .querySelector(target.hash)
          ?.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth' });
      else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'instant' : 'smooth' });
      return;
    }
    const apply = () => {
      entranceDelay.current = 0;
      window.history.pushState({}, '', target.pathname + target.hash);
      setRoute(target.pathname);
      window.scrollTo(0, 0);
      requestAnimationFrame(() =>
        document.getElementById('main-content')?.focus({ preventScroll: true }),
      );
      if (target.hash)
        setTimeout(
          () =>
            document.getElementById(target.hash.slice(1))?.scrollIntoView({ behavior: 'instant' }),
          140,
        );
    };
    if (reducedMotion() || !overlay.current) {
      apply();
      return;
    }
    navigating.current = true;
    gsap
      .timeline({
        onComplete: () => {
          navigating.current = false;
        },
      })
      .set(overlay.current, { yPercent: 100 })
      .to(overlay.current, { yPercent: 0, duration: 0.5, ease: 'power4.inOut' })
      .call(apply)
      .to(overlay.current, { yPercent: -100, duration: 0.65, ease: 'power4.inOut', delay: 0.05 })
      .set(overlay.current, { yPercent: 100 });
  }, []);
  const isAdmin = route.startsWith('/admin');
  const [visitorLang, setVisitorLang] = useState('');
  const language = effectiveLanguage(content.settings);
  useEffect(() => {
    if (!isAdmin) applyLanguage(language);
  }, [language, isAdmin, visitorLang]);
  const slug = route.startsWith('/projects/')
    ? route.slice('/projects/'.length).replace(/\/$/, '')
    : '';
  const project = content.projects.find((item) => item.slug === slug);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      {!isAdmin && (
        <Header
          profile={content.profile}
          copy={content.copy}
          isHome={route === '/'}
          navigate={navigate}
          language={content.settings?.languageMode ? language : undefined}
          onLanguage={setVisitorLang}
        />
      )}
      <div id="main-content" tabIndex={-1} translate={isAdmin ? 'no' : undefined}>
        {isAdmin ? (
          <Suspense
            fallback={
              <div className="route-loading">
                <LoaderCircle className="spin" size={28} />
                <span>Opening your studio...</span>
              </div>
            }
          >
            <Admin content={content} onContentChange={setContent} navigate={navigate} />
          </Suspense>
        ) : route === '/' ? (
          <Portfolio content={content} navigate={navigate} entranceDelay={entranceDelay.current} />
        ) : project ? (
          <ProjectDetail key={project.id} project={project} content={content} navigate={navigate} />
        ) : (
          <main className="not-found">
            <span className="eyebrow">404 / A SMALL DETOUR</span>
            <h1>
              Nothing here.
              <br />
              Plenty to explore.
            </h1>
            <a
              className="button primary"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate('/');
              }}
            >
              <ArrowLeft size={16} />
              Back to home
            </a>
          </main>
        )}
      </div>
      {loading && !isAdmin && (
        <PageLoader
          brand={content.profile.brand}
          caption={content.copy.loadingCaption}
          onComplete={() => setLoading(false)}
        />
      )}
      <div className="page-transition-shell" aria-hidden="true">
        <div ref={overlay} className="page-transition">
          <span>{content.profile.brand}.</span>
        </div>
      </div>
    </>
  );
}
