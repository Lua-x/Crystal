import { MapPin, Maximize, Minus, Plus } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '../../components/ui/icon-button'
import { cn } from '../../lib/cn'
import { clampView, fitView, zoomView, type Size, type View } from './map-view'

export interface MapPinView {
  id: string
  x: number
  y: number
  title: string
  completed: boolean
}

interface MapViewerProps {
  imageUrl: string
  name: string
  /** The picture's size, if the server knew it; otherwise it is measured once loaded. */
  width: number | null
  height: number | null
  pins: MapPinView[]
  selectedId: string | null
  /** Waiting for a spot: a click, or Enter for the middle of the view, places the pin. */
  placing: boolean
  onPlace: (x: number, y: number) => void
  onSelect: (id: string) => void
  /** Brings a pin into view; a new request (`nonce`) each time someone asks. */
  focus: { id: string; nonce: number } | null
}

const PAN_STEP = 80
const ZOOM_STEP = 1.25
/** Farther than this, a press is a drag, not a click. */
const CLICK_SLOP = 5

/**
 * A map picture that can be moved and zoomed with mouse, touch, trackpad and
 * keyboard. Pins are buttons on top of it; they keep their size at every zoom.
 */
export function MapViewer({
  imageUrl,
  name,
  width,
  height,
  pins,
  selectedId,
  placing,
  onPlace,
  onSelect,
  focus,
}: MapViewerProps) {
  const { t } = useTranslation()
  const instructionsId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<Size | null>(width && height ? { width, height } : null)
  const [box, setBox] = useState<Size>({ width: 0, height: 0 })
  const [view, setView] = useState<View | null>(null)
  /** Until someone moves or zooms, the map keeps fitting its box when that changes. */
  const [touched, setTouched] = useState(false)
  const [fittedTo, setFittedTo] = useState<string | null>(null)
  const [handledFocus, setHandledFocus] = useState(focus)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Fit the picture into the box – at first, and while nobody has moved it.
  const sizes =
    natural && box.width > 0 && box.height > 0
      ? `${natural.width}x${natural.height}@${box.width}x${box.height}`
      : null
  if (natural && sizes && sizes !== fittedTo) {
    setFittedTo(sizes)
    if (!touched || !view) setView(fitView(natural, box))
  }

  // Show a pin someone asked for, zoomed in a little if the whole map is shown.
  if (focus !== handledFocus) {
    setHandledFocus(focus)
    const pin = focus && pins.find((item) => item.id === focus.id)
    if (pin && natural && view && box.width > 0) {
      const scale = Math.max(view.scale, fitView(natural, box).scale * 2)
      setTouched(true)
      setView(
        clampView(
          {
            scale,
            x: box.width / 2 - pin.x * natural.width * scale,
            y: box.height / 2 - pin.y * natural.height * scale,
          },
          natural,
          box,
        ),
      )
    }
  }

  const update = useCallback(
    (change: (current: View) => View) => {
      if (!natural) return
      setTouched(true)
      setView((current) => (current ? clampView(change(current), natural, box) : current))
    },
    [natural, box],
  )

  const zoomAt = useCallback(
    (factor: number, x: number, y: number) => {
      if (!natural) return
      update((current) => zoomView(current, factor, x, y, natural, box))
    },
    [natural, box, update],
  )

  // Wheel and trackpad zoom; the listener is not passive, so the page does not scroll.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      // Pinching on a trackpad sends small wheel steps with Ctrl.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015))
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /** Where on the picture (0–1) a point of the box is; `null` outside the picture. */
  const toPicture = (x: number, y: number) => {
    if (!view || !natural) return null
    const px = (x - view.x) / (natural.width * view.scale)
    const py = (y - view.y) / (natural.height * view.scale)
    return px >= 0 && px <= 1 && py >= 0 && py <= 1 ? { x: px, y: py } : null
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Pins and controls handle their own clicks.
    if ((event.target as Element).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    gesture.current =
      pointers.current.size === 1
        ? { startX: event.clientX, startY: event.clientY, moved: false }
        : gesture.current && { ...gesture.current, moved: true }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (pointers.current.size === 2) {
      // Pinch: zoom by the change in distance, around the middle of both fingers.
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ]
      const other = a === previous ? b : a
      const before = Math.hypot(previous.x - other.x, previous.y - other.y)
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      if (before > 0) {
        zoomAt(
          after / before,
          (event.clientX + other.x) / 2 - rect.left,
          (event.clientY + other.y) / 2 - rect.top,
        )
      }
    } else {
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      update((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (
      current &&
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > CLICK_SLOP
    ) {
      current.moved = true
    }
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return
    const current = gesture.current
    if (pointers.current.size > 0) return
    gesture.current = null
    if (!placing || !current || current.moved) return
    const rect = event.currentTarget.getBoundingClientRect()
    const spot = toPicture(event.clientX - rect.left, event.clientY - rect.top)
    if (spot) onPlace(spot.x, spot.y)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !natural) return
    const middle = { x: box.width / 2, y: box.height / 2 }
    const pan = (dx: number, dy: number) =>
      update((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    switch (event.key) {
      case 'ArrowLeft':
        pan(PAN_STEP, 0)
        break
      case 'ArrowRight':
        pan(-PAN_STEP, 0)
        break
      case 'ArrowUp':
        pan(0, PAN_STEP)
        break
      case 'ArrowDown':
        pan(0, -PAN_STEP)
        break
      case '+':
      case '=':
        zoomAt(ZOOM_STEP, middle.x, middle.y)
        break
      case '-':
        zoomAt(1 / ZOOM_STEP, middle.x, middle.y)
        break
      case '0':
        setTouched(false)
        setView(fitView(natural, box))
        break
      case 'Enter': {
        if (!placing) return
        const spot = toPicture(middle.x, middle.y)
        if (spot) onPlace(spot.x, spot.y)
        break
      }
      default:
        return
    }
    event.preventDefault()
  }

  const pictureWidth = natural && view ? natural.width * view.scale : 0
  const pictureHeight = natural && view ? natural.height * view.scale : 0
  // The selected pin is drawn last, so it is on top.
  const ordered = [...pins].sort(
    (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId) || a.y - b.y,
  )

  /* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex --
     The map surface is an application: it is moved and zoomed with the keyboard as well. */
  return (
    <div
      ref={containerRef}
      // It handles the arrow keys itself, so screen readers pass them on.
      role="application"
      aria-roledescription={t('maps.title')}
      aria-label={t('maps.label', { name })}
      aria-describedby={instructionsId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'relative size-full touch-none overflow-hidden bg-fill-control outline-none select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring',
        placing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing',
      )}
    >
      <p id={instructionsId} className="sr-only">
        {t('maps.instructions')}
      </p>
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        onLoad={(event) => {
          if (natural) return
          const image = event.currentTarget
          setNatural({ width: image.naturalWidth, height: image.naturalHeight })
        }}
        style={
          natural && view
            ? {
                width: natural.width,
                height: natural.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }
            : { visibility: 'hidden' }
        }
        className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left will-change-transform"
      />

      {view &&
        ordered.map((pin) => {
          const selected = pin.id === selectedId
          return (
            <button
              key={pin.id}
              type="button"
              aria-label={pin.completed ? t('maps.completedPin', { title: pin.title }) : pin.title}
              aria-pressed={selected}
              onClick={() => onSelect(pin.id)}
              style={{
                left: view.x + pin.x * pictureWidth,
                top: view.y + pin.y * pictureHeight,
              }}
              className="absolute flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <MapPin
                aria-hidden
                strokeWidth={1.75}
                className={cn(
                  'drop-shadow-md transition-[width,height] duration-150',
                  selected ? 'size-10' : 'size-8',
                  pin.completed ? 'fill-text-secondary text-canvas' : 'fill-accent text-on-accent',
                )}
              />
              {selected && (
                <span className="pointer-events-none absolute top-full mt-1 max-w-48 truncate rounded-md bg-elevated px-2 py-0.5 text-footnote font-medium text-text shadow-md">
                  {pin.title}
                </span>
              )}
            </button>
          )
        })}

      {placing && (
        // Where Enter places the pin.
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 size-6 -translate-1/2 rounded-full border-2 border-accent bg-accent/20"
        />
      )}

      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl bg-elevated shadow-md">
        <IconButton
          label={t('maps.zoomIn')}
          onClick={() => zoomAt(ZOOM_STEP, box.width / 2, box.height / 2)}
        >
          <Plus />
        </IconButton>
        <IconButton
          label={t('maps.zoomOut')}
          onClick={() => zoomAt(1 / ZOOM_STEP, box.width / 2, box.height / 2)}
        >
          <Minus />
        </IconButton>
        <IconButton
          label={t('maps.fit')}
          onClick={() => {
            if (!natural) return
            setTouched(false)
            setView(fitView(natural, box))
          }}
        >
          <Maximize />
        </IconButton>
      </div>
    </div>
  )
  /* eslint-enable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */
}
