"use client";

import { motion } from "motion/react";

/**
 * One entrance moment for the staff overview.
 *
 * Keeps the page a server component while adding the tiny fade+slide that makes
 * the new dashboard feel less abrupt without animating every card in turn.
 */
export function PageEntrance({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
