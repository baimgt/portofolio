import { useEffect, useId, useRef, type PointerEvent } from 'react';
import gsap from 'gsap';
import { RotateCcw } from 'lucide-react';
import { reducedMotion } from './Motion';
import IdentityBadge from './IdentityBadge';
import { soundEngine } from '../lib/sound';
import type { IdentityCardContent, Profile } from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const DEG2RAD = Math.PI / 180;
const BASE_ROTATION = 11;
const FRONT_TOP_X = 336;
const BACK_TOP_X = 290;
const STRAP_TOP_Y = -52;

export default function InteractiveLanyard({
  profile,
  card,
}: {
  profile: Profile;
  card: IdentityCardContent;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const position = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const attachment = useRef<HTMLSpanElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const frontPath = useRef<SVGPathElement>(null);
  const backPath = useRef<SVGPathElement>(null);
  const pathId = `lanyard-${useId().replace(/:/g, '')}`;
  const motion = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: BASE_ROTATION,
    visible: true,
    spring: false,
    maxScroll: 0,
    tiltActive: false,
  });
  const geom = useRef({
    originX: 291.5,
    originY: 274,
    ax: 0.5,
    ay: -6.5,
    calibrated: false,
  });
  const drag = useRef<{
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    pointerId: number;
    maxY: number;
  } | null>(null);
  const resetRef = useRef<() => void>(() => {});

  const localPoint = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      : new DOMPoint(clientX, clientY);
  };

  useEffect(() => {
    const node = position.current;
    const tiltNode = tilt.current;
    const canvas = svg.current;
    const marker = attachment.current;
    if (!node || !tiltNode || !canvas || !marker) return;

    const hero = stage.current?.closest<HTMLElement>('.hero');
    const state = motion.current;
    const setX = gsap.quickSetter(node, 'x', 'px');
    const setY = gsap.quickSetter(node, 'y', 'px');
    const setRotation = gsap.quickSetter(node, 'rotation', 'deg');

    const readAttachmentFromDOM = () => {
      const matrix = canvas.getScreenCTM();
      if (!matrix) return null;
      const rect = marker.getBoundingClientRect();
      return new DOMPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      ).matrixTransform(matrix.inverse());
    };

    const calibrateGeometry = () => {
      const style = getComputedStyle(canvas);
      const svgLeft = parseFloat(style.left) || 0;
      const svgTop = parseFloat(style.top) || 0;
      const originX = node.offsetLeft + tiltNode.offsetWidth * 0.5 - svgLeft;
      const originY = node.offsetTop - 40 - svgTop;
      geom.current.originX = originX;
      geom.current.originY = originY;

      const domPoint = readAttachmentFromDOM();
      if (domPoint) {
        const rad = state.rot * DEG2RAD;
        const dx = domPoint.x - (originX + state.x);
        const dy = domPoint.y - (originY + state.y);
        geom.current.ax = dx * Math.cos(rad) + dy * Math.sin(rad);
        geom.current.ay = -dx * Math.sin(rad) + dy * Math.cos(rad);
        geom.current.calibrated = true;
      }
    };

    const computeEndpoint = (x: number, y: number, rotDeg: number, domEndpoint: DOMPoint | null) => {
      if (domEndpoint) return domEndpoint;
      const { originX, originY, ax, ay } = geom.current;
      const rad = rotDeg * DEG2RAD;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return {
        x: originX + x + ax * cos - ay * sin,
        y: originY + y + ax * sin + ay * cos,
      };
    };

    const draw = (end: { x: number; y: number }, rotDeg: number) => {
      const rotRad = rotDeg * DEG2RAD;
      const nx = Math.sin(rotRad);
      const ny = -Math.cos(rotRad);
      const dx = end.x - FRONT_TOP_X;
      const dy = end.y - STRAP_TOP_Y;
      const dist = Math.hypot(dx, dy);
      const slack = clamp(1 - Math.max(0, end.y - 290) / 840, 0.06, 1);
      const sway = clamp(-state.vx * 2.1, -55, 55) * slack;
      const handleOut = clamp(dist * 0.34, 48, 175);

      const cp1x = FRONT_TOP_X + dx * 0.14 + sway * 0.45;
      const cp1y = STRAP_TOP_Y + dy * 0.38;
      const cp2x = end.x + nx * handleOut + sway * 0.16;
      const cp2y = end.y + ny * handleOut;

      const frontD = `M ${FRONT_TOP_X} ${STRAP_TOP_Y} C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
      frontPath.current?.setAttribute('d', frontD);

      const backDx = end.x - BACK_TOP_X;
      const backCp1x = BACK_TOP_X + backDx * 0.22 + sway * 0.3;
      const backCp1y = STRAP_TOP_Y + dy * 0.42;
      const backCp2x = end.x + nx * (handleOut * 0.92) + sway * 0.12;
      const backCp2y = end.y + ny * (handleOut * 0.92);

      const backD = `M ${BACK_TOP_X} ${STRAP_TOP_Y} C ${backCp1x.toFixed(2)} ${backCp1y.toFixed(2)} ${backCp2x.toFixed(2)} ${backCp2y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
      backPath.current?.setAttribute('d', backD);

      canvas.dataset.endX = String(end.x);
      canvas.dataset.endY = String(end.y);
      node.dataset.offsetY = String(state.y);
      node.dataset.offsetX = String(state.x);
    };

    const release = () => {
      if (!drag.current && !state.spring && Math.abs(state.x) + Math.abs(state.y) < 1) return;
      const hadDisplacement = Boolean(drag.current) || Math.abs(state.x) + Math.abs(state.y) > 8;
      drag.current = null;
      state.spring = true;
      node.dataset.dragging = 'false';
      if (hadDisplacement) soundEngine.playRelease();
      gsap.to(tiltNode, {
        rotationX: 0,
        rotationY: 0,
        duration: reducedMotion() ? 0 : 0.6,
        overwrite: 'auto',
        onComplete: () => {
          state.tiltActive = false;
        },
      });
      if (reducedMotion()) {
        state.x = state.y = state.vx = state.vy = 0;
        state.rot = BASE_ROTATION;
        state.spring = false;
        setX(0);
        setY(0);
        setRotation(BASE_ROTATION);
        draw(computeEndpoint(0, 0, BASE_ROTATION, null), BASE_ROTATION);
        hero?.classList.remove('is-card-dragging');
      }
    };
    resetRef.current = release;

    let last = 0;
    const frame = (time: number) => {
      if (!state.visible && !drag.current && !state.spring) return;
      const dt = last ? clamp((time - last) * 60, 0.4, 1.8) : 1;
      last = time;

      if (drag.current) {
        const current = drag.current;
        const scrollSpeed =
          current.clientY > innerHeight - 80
            ? clamp((current.clientY - innerHeight + 80) * 0.35, 0, 20)
            : current.clientY < 65
              ? -clamp((65 - current.clientY) * 0.3, 0, 17)
              : 0;
        if (
          scrollSpeed &&
          ((scrollSpeed > 0 && scrollY < state.maxScroll) || (scrollSpeed < 0 && scrollY > 0))
        )
          window.scrollBy(0, scrollSpeed * dt);
        const point = localPoint(current.clientX, current.clientY);
        const nextX = clamp(point.x - current.startX, -850, 450);
        const nextY = clamp(point.y - current.startY, -135, current.maxY);
        state.vx = (nextX - state.x) * 0.35;
        state.vy = (nextY - state.y) * 0.35;
        state.x = nextX;
        state.y = nextY;
      } else if (state.spring) {
        state.vx = (state.vx - state.x * 0.022 * dt) * Math.pow(0.83, dt);
        state.vy = (state.vy - state.y * 0.022 * dt) * Math.pow(0.83, dt);
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        if (state.y < -135) {
          state.y = -135;
          state.vy *= -0.22;
        }
        if (
          Math.abs(state.x) + Math.abs(state.y) + Math.abs(state.vx) + Math.abs(state.vy) <
          0.35
        ) {
          state.x = state.y = state.vx = state.vy = 0;
          state.spring = false;
          hero?.classList.remove('is-card-dragging');
        }
      } else if (reducedMotion()) {
        return;
      }

      const idle = !drag.current && !state.spring && !reducedMotion();
      const renderX = state.x;
      const renderY = state.y + (idle ? Math.sin(time * 0.8) * 3 : 0);
      const renderRot =
        BASE_ROTATION +
        clamp(state.x * 0.014 - state.vx * 0.25, -16, 16) +
        (idle ? Math.sin(time * 0.65) * 1.1 : 0);
      state.rot = renderRot;

      // Read DOM endpoint only while 3D tilt is actively animating; read before write to avoid thrash.
      const domEndpoint = state.tiltActive ? readAttachmentFromDOM() : null;

      setX(renderX);
      setY(renderY);
      setRotation(renderRot);
      draw(computeEndpoint(renderX, renderY, renderRot, domEndpoint), renderRot);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        state.visible = entries[0].isIntersecting;
      },
      { rootMargin: '100px' },
    );
    if (stage.current) observer.observe(stage.current);

    const resize = () => {
      calibrateGeometry();
      draw(computeEndpoint(state.x, state.y, state.rot, null), state.rot);
    };
    window.addEventListener('resize', resize);
    setRotation(BASE_ROTATION);
    calibrateGeometry();
    draw(computeEndpoint(0, 0, BASE_ROTATION, null), BASE_ROTATION);
    gsap.ticker.add(frame);

    return () => {
      gsap.ticker.remove(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      hero?.classList.remove('is-card-dragging');
      gsap.killTweensOf(tiltNode);
    };
  }, []);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) return;
    event.preventDefault();
    event.currentTarget.dataset.inputMode = 'pointer';
    event.currentTarget.focus({ preventScroll: true });
    soundEngine.playGrab();
    const point = localPoint(event.clientX, event.clientY);
    const matrix = svg.current?.getScreenCTM();
    const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
    const documentHeight = document.documentElement.scrollHeight;
    const hero = stage.current?.closest<HTMLElement>('.hero');
    motion.current.maxScroll = documentHeight - innerHeight;
    if (motion.current.tiltActive && tilt.current) {
      gsap.to(tilt.current, {
        rotationX: 0,
        rotationY: 0,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: 'auto',
        onComplete: () => {
          motion.current.tiltActive = false;
        },
      });
    }
    drag.current = {
      startX: point.x - motion.current.x,
      startY: point.y - motion.current.y,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      maxY: Math.max(1000, (documentHeight + innerHeight - (hero?.offsetTop || 0)) / scale),
    };
    motion.current.spring = false;
    hero?.classList.add('is-card-dragging');
    if (position.current) position.current.dataset.dragging = 'true';
    gsap.set(stage.current?.querySelector('.lanyard-reveal') || [], { clipPath: 'none' });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      drag.current.clientX = event.clientX;
      drag.current.clientY = event.clientY;
      return;
    }
    if (event.pointerType !== 'mouse' || reducedMotion()) return;
    motion.current.tiltActive = true;
    const bounds = event.currentTarget.getBoundingClientRect();
    gsap.to(tilt.current, {
      rotationY: (event.clientX - bounds.left - bounds.width / 2) / 43,
      rotationX: -(event.clientY - bounds.top - bounds.height / 2) / 55,
      duration: 0.7,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  };

  return (
    <div
      className="hero-lanyard"
      ref={stage}
      aria-label={`Kartu identitas kreatif ${profile.name}`}
    >
      <div className="lanyard-reveal">
        <div className="lanyard-parallax">
          <svg
            ref={svg}
            className="lanyard-strap"
            viewBox="0 0 560 2000"
            width="560"
            height="2000"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id={`${pathId}-weave`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(35)"
              >
                <rect width="6" height="6" fill="#171e2a" />
                <line x1="0" y1="0" x2="6" y2="0" stroke="#9eb8e2" strokeOpacity="0.09" strokeWidth="1.2" />
                <line x1="0" y1="3" x2="6" y2="3" stroke="#080c13" strokeOpacity="0.45" strokeWidth="1.2" />
              </pattern>
              <pattern
                id={`${pathId}-weave-back`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-35)"
              >
                <rect width="6" height="6" fill="#10151f" />
                <line x1="0" y1="0" x2="6" y2="0" stroke="#7c96c2" strokeOpacity="0.06" strokeWidth="1" />
                <line x1="0" y1="3" x2="6" y2="3" stroke="#05080d" strokeOpacity="0.5" strokeWidth="1.2" />
              </pattern>
              <linearGradient
                id={`${pathId}-shadow-grad`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#05080e" stopOpacity="0.7" />
                <stop offset="55%" stopColor="#05080e" stopOpacity="0" />
                <stop offset="100%" stopColor="#05080e" stopOpacity="0.55" />
              </linearGradient>
              <path
                ref={backPath}
                id={`${pathId}-back`}
                d="M 290 -52 C 292 75 299 165 293 267"
              />
              <path
                ref={frontPath}
                id={pathId}
                d="M 336 -52 C 330 70 315 158 293 267"
              />
            </defs>

            {/* Back neck-loop strand for realistic 3D strap depth */}
            <g className="lanyard-strand-back">
              <use href={`#${pathId}-back`} stroke="#070a10" strokeWidth="31" strokeLinecap="round" />
              <use href={`#${pathId}-back`} stroke="#2b3546" strokeOpacity="0.45" strokeWidth="29" strokeLinecap="round" />
              <use href={`#${pathId}-back`} stroke={`url(#${pathId}-weave-back)`} strokeWidth="27" strokeLinecap="round" />
              <use
                href={`#${pathId}-back`}
                stroke="#86a0ca"
                strokeOpacity="0.16"
                strokeWidth="22"
                strokeDasharray="2.5 3.5"
              />
              <use href={`#${pathId}-back`} stroke={`url(#${pathId}-weave-back)`} strokeWidth="18" strokeLinecap="round" />
            </g>

            {/* Front woven twill lanyard strand with stitched selvedge edges */}
            <g className="lanyard-strand-front">
              <use href={`#${pathId}`} stroke="#070a10" strokeWidth="37" strokeLinecap="round" />
              <use href={`#${pathId}`} stroke="#424e63" strokeOpacity="0.6" strokeWidth="35" strokeLinecap="round" />
              <use href={`#${pathId}`} stroke={`url(#${pathId}-weave)`} strokeWidth="33" strokeLinecap="round" />
              <use
                href={`#${pathId}`}
                stroke="#a8bee3"
                strokeOpacity="0.3"
                strokeWidth="28"
                strokeDasharray="2.5 3.5"
              />
              <use href={`#${pathId}`} stroke={`url(#${pathId}-weave)`} strokeWidth="24" strokeLinecap="round" />
              <use href={`#${pathId}`} stroke="#dbe7ff" strokeOpacity="0.05" strokeWidth="10" strokeLinecap="round" />
              <use href={`#${pathId}`} stroke={`url(#${pathId}-shadow-grad)`} strokeWidth="34" strokeLinecap="round" />
              <text
                fill="#dce4f1"
                fillOpacity="0.9"
                fontSize="8"
                fontWeight="750"
                letterSpacing="2"
                dominantBaseline="central"
              >
                <textPath href={`#${pathId}`} startOffset="57%" textAnchor="middle">
                  {card.strapText} + {(card.brandText || profile.brand).toUpperCase()}.
                </textPath>
              </text>
            </g>
          </svg>
          <div ref={position} className="badge-position" data-dragging="false" data-offset-y="0">
            <div
              ref={tilt}
              className="badge-tilt"
              tabIndex={0}
              role="group"
              aria-label={card.dragHint}
              aria-describedby={`${pathId}-instructions`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => resetRef.current()}
              onPointerCancel={() => resetRef.current()}
              onLostPointerCapture={() => {
                if (drag.current) resetRef.current();
              }}
              onPointerLeave={() => {
                if (!drag.current)
                  gsap.to(tilt.current, {
                    rotationX: 0,
                    rotationY: 0,
                    duration: 0.7,
                    overwrite: 'auto',
                    onComplete: () => {
                      motion.current.tiltActive = false;
                    },
                  });
              }}
              onKeyDown={(event) => {
                event.currentTarget.dataset.inputMode = 'keyboard';
                if (event.target !== event.currentTarget) return;
                const offsets: Record<string, [number, number]> = {
                  ArrowDown: [0, 80],
                  ArrowUp: [0, -80],
                  ArrowLeft: [-50, 0],
                  ArrowRight: [50, 0],
                };
                if (event.key === 'Home' || event.key === 'Escape') {
                  event.preventDefault();
                  resetRef.current();
                }
                if (offsets[event.key]) {
                  event.preventDefault();
                  motion.current.x += offsets[event.key][0];
                  motion.current.y = clamp(motion.current.y + offsets[event.key][1], -100, 900);
                  motion.current.spring = false;
                  stage.current?.closest('.hero')?.classList.add('is-card-dragging');
                  gsap.set(event.currentTarget.closest('.lanyard-reveal'), { clipPath: 'none' });
                }
              }}
            >
              <span ref={attachment} className="strap-attachment" />
              <div className="badge-clip" aria-hidden="true">
                <div className="clip-collar" />
                <div className="clip-hole" />
                <div className="clip-metal" />
                <div className="clip-ring" />
              </div>
              <IdentityBadge profile={profile} card={card} priority />
              <button
                type="button"
                className="lanyard-reset"
                aria-label={card.resetLabel}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  motion.current.spring = true;
                  resetRef.current();
                }}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            <span className="sr-only" id={`${pathId}-instructions`}>
              {card.dragHint}
              <span>{card.keyboardHint}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
