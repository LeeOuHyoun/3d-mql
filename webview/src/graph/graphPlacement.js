import { groupBy, maxBy, meanBy, partition, range, sortBy } from 'lodash-es'
import { EDGE_LENGTH } from './graphLayouts.js'

const SLOT_GAP = 36
const NUDGE_GAP = 14
const DIRECTIONS = 72
const HALF_SPAN = (Math.PI * 2) / 3
const POLITE_LEVELS = 3
const NUDGE_ROUNDS = 80
const EXISTING_MOBILITY = 0.3
const TAU = Math.PI * 2

const isOverlapping = (a, b, gap) =>
  (a.w + b.w) / 2 + gap > Math.abs(b.x - a.x) && (a.h + b.h) / 2 + gap > Math.abs(b.y - a.y)

const ringOf = (parent, child, level) => ({
  rx: (parent.w + child.w) / 2 + EDGE_LENGTH + level * (child.w + SLOT_GAP),
  ry: (parent.h + child.h) / 2 + EDGE_LENGTH + level * (child.h + SLOT_GAP),
})

const slotAt = (parent, child, ring, angle) => ({
  ...child,
  x: parent.x + ring.rx * Math.cos(angle),
  y: parent.y + ring.ry * Math.sin(angle),
})

const stepAt = (ring, child, angle) =>
  Math.min(
    (child.w + SLOT_GAP) / (ring.rx * Math.max(Math.abs(Math.sin(angle)), 1e-6)),
    (child.h + SLOT_GAP) / (ring.ry * Math.max(Math.abs(Math.cos(angle)), 1e-6)),
  )

const freeDirection = (parent, child, obstacles, away) => {
  const ring = ringOf(parent, child, 0)
  const unit = TAU / DIRECTIONS
  const isBlocked = range(DIRECTIONS).map((i) =>
    obstacles.some((other) => isOverlapping(slotAt(parent, child, ring, i * unit), other, SLOT_GAP)),
  )
  const runs = range(DIRECTIONS)
    .filter((i) => !isBlocked[i] && isBlocked[(i + DIRECTIONS - 1) % DIRECTIONS])
    .map((start) => ({ start, length: range(DIRECTIONS).findIndex((k) => isBlocked[(start + k) % DIRECTIONS]) }))
  const widest = maxBy(runs, 'length')
  return widest ? (widest.start + (widest.length - 1) / 2) * unit : away
}

const slotAngles = (ring, child, mid, isOdd) => {
  const walk = (sign) => {
    const angles = []
    let angle = isOdd ? mid : mid - (sign * stepAt(ring, child, mid)) / 2
    for (;;) {
      angle += sign * stepAt(ring, child, angle)
      if (Math.abs(angle - mid) > HALF_SPAN) return angles
      angles.push(angle)
    }
  }
  return [...(isOdd ? [mid] : []), ...walk(1), ...walk(-1)]
}

const fanOut = (parent, children, obstacles, away) => {
  const mid = freeDirection(parent, children[0], obstacles, away)
  const placed = []
  for (let level = 0; placed.length < children.length; level++) {
    const rest = children.slice(placed.length)
    const isPolite = level < POLITE_LEVELS
    const ring = ringOf(parent, rest[0], isPolite ? level : level - POLITE_LEVELS)
    const blockers = isPolite ? [...obstacles, ...placed] : placed
    const isFree = (angle) =>
      !blockers.some((other) => isOverlapping(slotAt(parent, rest[0], ring, angle), other, SLOT_GAP))
    const [matched, other] = [rest.length % 2 === 1, rest.length % 2 === 0].map((isOdd) =>
      slotAngles(ring, rest[0], mid, isOdd).filter(isFree),
    )
    const pool = matched.length >= rest.length || matched.length >= other.length ? matched : other
    const angles = pool.length || isPolite ? pool : [mid]
    const nearest = sortBy(angles, (angle) => Math.abs(angle - mid)).slice(0, rest.length)
    sortBy(nearest).forEach((angle, i) => placed.push(slotAt(parent, rest[i], ring, angle)))
  }
  return placed
}

const nudge = (boxes, added) => {
  let active = added
  for (let round = 0; round < NUDGE_ROUNDS && active.length; round++) {
    const moved = new Set()
    active.forEach((a) =>
      boxes.forEach((b) => {
        const depth = {
          x: (a.w + b.w) / 2 + NUDGE_GAP - Math.abs(b.x - a.x),
          y: (a.h + b.h) / 2 + NUDGE_GAP - Math.abs(b.y - a.y),
        }
        const total = a.mobility + b.mobility
        if (a === b || depth.x <= 0 || depth.y <= 0 || !total) return
        const axis = depth.x < depth.y ? 'x' : 'y'
        const push = ((b[axis] < a[axis] ? -1 : 1) * depth[axis]) / total
        a[axis] -= push * a.mobility
        b[axis] += push * b.mobility
        moved.add(a).add(b)
      }),
    )
    active = [...moved]
  }
}

export const placeAdded = ({ boxes, addedIds, neighborsOf, anchorId, fallback }) => {
  const added = new Set(addedIds)
  const mobilityOf = (id) => (id === anchorId ? 0 : added.has(id) ? 1 : EXISTING_MOBILITY)
  const byId = new Map(boxes.map((box) => [box.id, { ...box, mobility: mobilityOf(box.id) }]))
  const placed = new Set(boxes.filter((box) => !added.has(box.id)).map((box) => box.id))
  const boxesOf = (ids) => [...ids].map((id) => byId.get(id))
  const centerOf = (ids) => ({ x: meanBy(boxesOf(ids), 'x'), y: meanBy(boxesOf(ids), 'y') })
  const put = (box) => {
    byId.set(box.id, box)
    placed.add(box.id)
  }
  const fan = (parent, children, away) => {
    const obstacles = boxesOf(placed).filter((box) => box !== parent)
    fanOut(parent, children, obstacles, away).forEach(put)
  }
  for (;;) {
    const pending = [...byId.values()].filter((box) => added.has(box.id) && !placed.has(box.id))
    const [between, hanging] = partition(pending, (box) => box.ends?.length)
    const ready = between.filter((box) => box.ends.every((id) => placed.has(id)))
    const linked = hanging
      .map((box) => ({ box, parents: neighborsOf(box.id).filter((id) => placed.has(id)) }))
      .filter(({ parents }) => parents.length)
    if (ready.length) {
      ready.forEach((box) => put({ ...box, ...centerOf(box.ends) }))
    } else if (linked.length) {
      const center = centerOf(placed)
      const groups = groupBy(linked, ({ parents }) => (parents.includes(anchorId) ? anchorId : parents[0]))
      Object.entries(groups).forEach(([parentId, group]) => {
        const parent = byId.get(parentId)
        const away = Math.atan2(parent.y - center.y, parent.x - center.x)
        fan(parent, group.map(({ box }) => box), away)
      })
    } else if (hanging.length) {
      fan({ ...fallback, w: 0, h: 0 }, hanging, Math.PI / 2)
    } else {
      break
    }
  }
  const all = [...byId.values()]
  nudge(
    all,
    all.filter((box) => added.has(box.id)),
  )
  return Object.fromEntries(all.map(({ id, x, y }) => [id, { x, y }]))
}
