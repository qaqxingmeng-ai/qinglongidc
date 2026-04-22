/**
 * 后台统一 motion 预设。基调：克制、无弹跳、≤250ms、尊重 reduced-motion。
 */
import type { Transition, Variants } from 'framer-motion';

export const springSoft: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 0.9,
};

export const springTight: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 34,
  mass: 0.7,
};

export const easeOut: Transition = {
  type: 'tween',
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
};

export const easeOutFast: Transition = {
  type: 'tween',
  duration: 0.14,
  ease: [0.4, 0, 0.2, 1],
};

export const routeFade: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -4, transition: easeOutFast },
};

export const staggerContainer = (stagger = 0.05, delayChildren = 0.02): Variants => ({
  initial: {},
  animate: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: easeOut },
};

export const kpiItem: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: springSoft },
};
