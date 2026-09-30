import { Link } from '@tanstack/react-router'
import { ChevronLeft, PanelLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '../../components/ui/icon-button'
import { cn } from '../../lib/cn'
import { useDocumentTitle } from '../../lib/document-title'
import { useShell } from './shell-context'

interface PageProps {
  title: string
  /** Shown before the large title, e.g. a list's emoji. */
  titleIcon?: ReactNode
  /** Color class for the large title (lists use their color). */
  titleClassName?: string
  subtitle?: ReactNode
  /** Shows a back button to this path instead of the sidebar toggle. */
  backTo?: '/settings'
  actions?: ReactNode
  /** Hide the sidebar toggle, e.g. inside a split view that brings its own. */
  hideSidebarToggle?: boolean
  /** `grouped` uses a gray background for inset sections, like iOS settings. */
  variant?: 'plain' | 'grouped'
  children: ReactNode
  className?: string
}

/**
 * A scrolling page with a large title. Once the title scrolls away, a compact
 * version appears in the translucent toolbar, as in iOS and macOS.
 */
export function Page({
  title,
  titleIcon,
  titleClassName,
  subtitle,
  backTo,
  actions,
  hideSidebarToggle = false,
  variant = 'plain',
  children,
  className,
}: PageProps) {
  const { t } = useTranslation()
  const { isCompact, sidebarOpen, toggleSidebar } = useShell()
  useDocumentTitle(title)
  const scrollRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [titleHidden, setTitleHidden] = useState(false)

  useEffect(() => {
    const title = titleRef.current
    if (!title || !scrollRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setTitleHidden(entry ? !entry.isIntersecting : false),
      { root: scrollRef.current, rootMargin: '-52px 0px 0px 0px' },
    )
    observer.observe(title)
    return () => observer.disconnect()
  }, [])

  const showToggle = !hideSidebarToggle && !backTo && (isCompact || !sidebarOpen)

  return (
    <div
      ref={scrollRef}
      className={cn('h-full overflow-y-auto', variant === 'grouped' ? 'bg-grouped' : 'bg-canvas')}
    >
      <header
        className={cn(
          'sticky top-0 z-10 box-content flex h-13 items-center gap-1 px-2 pt-[env(safe-area-inset-top)] transition-shadow',
          variant === 'grouped' ? 'material-bar-grouped' : 'material-bar',
          titleHidden && 'hairline-b',
        )}
      >
        {showToggle && (
          <IconButton
            label={t('shell.toggleSidebar')}
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
          >
            <PanelLeft />
          </IconButton>
        )}
        {backTo && (
          <Link
            to={backTo}
            className="flex h-8 cursor-default items-center gap-0.5 rounded-lg pr-2.5 pl-1 text-callout text-accent-text hover:bg-fill-hover pointer-coarse:h-11"
          >
            <ChevronLeft aria-hidden className="size-5" />
            {t('common.back')}
          </Link>
        )}
        <div
          aria-hidden
          className={cn(
            'min-w-0 flex-1 truncate px-2 text-callout font-semibold transition-opacity duration-200',
            titleHidden ? 'opacity-100' : 'opacity-0',
          )}
        >
          {title}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>

      <div className={cn('mx-auto w-full max-w-3xl px-5 pt-2 pb-16 sm:px-8', className)}>
        <h1
          ref={titleRef}
          className={cn(
            'flex items-center gap-2 text-large-title font-bold break-words',
            titleClassName,
          )}
        >
          {titleIcon}
          <span className="min-w-0">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-body text-text-secondary">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
