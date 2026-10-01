/**
 * Token & varian animasi bersama (library `motion`, import dari 'motion/react').
 * Semua durasi pendek (150–250ms) agar dashboard terasa responsif, bukan "lambat".
 * `prefers-reduced-motion` dihormati global lewat <MotionConfig reducedMotion="user"> di main.tsx.
 */
import type { Transition, Variants } from 'motion/react';

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATION = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

export const transitionBase: Transition = { duration: DURATION.base, ease: EASE_OUT };
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 };

/** Transisi halaman (outlet router). */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: 'easeIn' } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transitionBase },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transitionBase },
};

/** Container stagger — pasangkan dengan `staggerItem` pada anak. */
export function staggerContainer(stagger = 0.035, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

export const staggerItem: Variants = fadeInUp;

/** Panel modal (scale + fade). */
export const modalPanel: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: DURATION.fast, ease: 'easeIn' } },
};

export const backdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

/** Drawer dari kanan/kiri. */
export function drawerPanel(side: 'left' | 'right' = 'right'): Variants {
  const offset = side === 'right' ? '100%' : '-100%';
  return {
    hidden: { x: offset },
    show: { x: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
    exit: { x: offset, transition: { duration: DURATION.base, ease: 'easeIn' } },
  };
}

/** Micro-interaction tombol/kartu. */
export const pressable = { whileTap: { scale: 0.97 } } as const;
export const hoverLift = { whileHover: { y: -2 }, transition: springSnappy } as const;
