import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import { DURATION, EASE_OUT, fadeInUp, staggerContainer } from '@/lib/motion';

/** Fade + naik sedikit saat mount. Untuk blok konten tunggal (kartu, panel). */
export function FadeIn({ delay = 0, children, ...rest }: HTMLMotionProps<'div'> & { delay?: number; children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT, delay } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Container list ber-stagger. Anak langsung harus `<AnimatedItem>` (atau motion element
 * dengan `variants={staggerItem}`).
 *
 *   <AnimatedList className="grid gap-3">
 *     {items.map(i => <AnimatedItem key={i.id}>…</AnimatedItem>)}
 *   </AnimatedList>
 */
export function AnimatedList({
  stagger = 0.035,
  delay = 0,
  children,
  ...rest
}: HTMLMotionProps<'div'> & { stagger?: number; delay?: number; children?: ReactNode }) {
  return (
    <motion.div variants={staggerContainer(stagger, delay)} initial="hidden" animate="show" {...rest}>
      {children}
    </motion.div>
  );
}

export function AnimatedItem({ children, ...rest }: HTMLMotionProps<'div'> & { children?: ReactNode }) {
  return (
    <motion.div variants={fadeInUp} {...rest}>
      {children}
    </motion.div>
  );
}

/**
 * Varian baris tabel dengan delay berdasarkan index (dibatasi agar tabel panjang tidak lambat).
 * Pakai: <motion.tr custom={index} variants={tableRowVariants} initial="hidden" animate="show">
 */
// eslint-disable-next-line react-refresh/only-export-components
export const tableRowVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT, delay: Math.min(index, 12) * 0.025 },
  }),
};
