export interface Size {
  width: number
  height: number
}

/** How the picture is shown: scaled by `scale`, its top left corner at `x`, `y` in the box. */
export interface View {
  scale: number
  x: number
  y: number
}

/** The whole picture in the box, centered, with a little room around it. */
export function fitView(picture: Size, box: Size): View {
  const scale = Math.min(box.width / picture.width, box.height / picture.height) * 0.95
  return {
    scale,
    x: (box.width - picture.width * scale) / 2,
    y: (box.height - picture.height * scale) / 2,
  }
}

/** From half the fitting size to 16 times it (and at least twice the picture's pixels). */
export function scaleLimits(picture: Size, box: Size): { min: number; max: number } {
  const fit = fitView(picture, box).scale
  return { min: fit / 2, max: Math.max(fit * 16, 2) }
}

/** Zooms by `factor`, keeping the point `x`, `y` of the box where it is. */
export function zoomView(
  view: View,
  factor: number,
  x: number,
  y: number,
  picture: Size,
  box: Size,
): View {
  const { min, max } = scaleLimits(picture, box)
  const scale = Math.min(max, Math.max(min, view.scale * factor))
  const ratio = scale / view.scale
  return { scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio }
}

/** Keeps the middle of the box on the picture, so the map cannot get lost. */
export function clampView(view: View, picture: Size, box: Size): View {
  const width = picture.width * view.scale
  const height = picture.height * view.scale
  const middleX = box.width / 2
  const middleY = box.height / 2
  return {
    scale: view.scale,
    x: Math.min(middleX, Math.max(middleX - width, view.x)),
    y: Math.min(middleY, Math.max(middleY - height, view.y)),
  }
}
