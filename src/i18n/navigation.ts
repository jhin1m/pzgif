import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

/**
 * Locale-aware wrappers around next/link and the navigation hooks. Always
 * import Link from here rather than from `next/link`, so that adding locale #2
 * does not require touching every call site.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
