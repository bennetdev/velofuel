import { useMemo, useState } from 'react'
import {
    Area,
    ComposedChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts'

import type { GpxPoint, GpxRoute, RefillEvent, RefuelEvent } from '../types'

type RouteTimelineProps = {
    route: GpxRoute
    events: RefuelEvent[]
    refillEvents: RefillEvent[]
}

type ElevationPoint = { km: number; ele: number }

const ORANGE = '#E8540A'
const BLUE = '#3B82F6'
const PURPLE = '#7C3AED'
const REFILL_BLUE = '#2563EB'

function toRadians(deg: number): number {
    return (deg * Math.PI) / 180
}

function haversineKm(a: GpxPoint, b: GpxPoint): number {
    const radiusKm = 6371
    const dLat = toRadians(b.lat - a.lat)
    const dLon = toRadians(b.lon - a.lon)
    const lat1 = toRadians(a.lat)
    const lat2 = toRadians(b.lat)
    const sinLat = Math.sin(dLat / 2)
    const sinLon = Math.sin(dLon / 2)
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
    return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

function downsample<T>(arr: T[], maxPoints: number): T[] {
    if (arr.length <= maxPoints) {
        return arr
    }
    const step = (arr.length - 1) / (maxPoints - 1)
    const sampled: T[] = []
    for (let i = 0; i < maxPoints; i += 1) {
        const index = Math.round(i * step)
        sampled.push(arr[index])
    }
    return sampled
}

function formatTime(totalMinutes: number): string {
    const rounded = Math.max(0, Math.round(totalMinutes))
    const hours = Math.floor(rounded / 60)
    const minutes = rounded % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildElevationData(points: GpxPoint[]): ElevationPoint[] {
    const data: ElevationPoint[] = []
    let distance = 0
    for (let i = 0; i < points.length; i += 1) {
        if (i > 0) {
            distance += haversineKm(points[i - 1], points[i])
        }
        data.push({ km: distance, ele: points[i].ele })
    }
    return downsample(data, 500)
}

type HoveredMarker =
    | { kind: 'refuel'; event: RefuelEvent }
    | { kind: 'refill'; event: RefillEvent }

function TimelineStrip({ route, events, refillEvents }: RouteTimelineProps) {
    const [hovered, setHovered] = useState<HoveredMarker | null>(null)
    const distanceKm = route.distanceKm || 0

    return (
        <div className="timeline-strip" style={{ marginLeft: 92, marginRight: 30 }}>
            <div className="timeline-line" />
            <div className="timeline-label start">0 km</div>
            <div className="timeline-label end">{Math.round(distanceKm)} km</div>
            {events.map((event, index) => {
                const percent = distanceKm > 0 ? (event.km / distanceKm) * 100 : 0
                const markerStyle =
                    event.type === 'combined'
                        ? { background: `linear-gradient(90deg, ${ORANGE} 50%, ${BLUE} 50%)` }
                        : { backgroundColor: event.type === 'food' ? ORANGE : BLUE }
                return (
                    <button
                        key={`${event.km}-${index}`}
                        className="timeline-marker"
                        type="button"
                        style={{ left: `${percent}%`, ...markerStyle }}
                        onMouseEnter={() => setHovered({ kind: 'refuel', event })}
                        onMouseLeave={() => setHovered((current) => (current?.event === event ? null : current))}
                    >
                        <span className="sr-only">Refuel event</span>
                    </button>
                )
            })}
            {refillEvents.map((event, index) => {
                const percent = distanceKm > 0 ? (event.km / distanceKm) * 100 : 0
                return (
                    <button
                        key={`refill-${event.km}-${index}`}
                        className="timeline-marker refill"
                        type="button"
                        style={{ left: `${percent}%`, backgroundColor: REFILL_BLUE }}
                        onMouseEnter={() => setHovered({ kind: 'refill', event })}
                        onMouseLeave={() => setHovered((current) => (current?.event === event ? null : current))}
                    >
                        <span className="sr-only">Refill bottles</span>
                    </button>
                )
            })}
            {hovered ? (
                <div
                    className="timeline-tooltip"
                    style={{ left: `${distanceKm > 0 ? (hovered.event.km / distanceKm) * 100 : 0}%` }}
                >
                    {hovered.kind === 'refuel' ? (
                        <>
                            <p>
                                <strong>{hovered.event.km.toFixed(1)} km</strong> · {formatTime(hovered.event.timeMin)}
                            </p>
                            {hovered.event.type === 'food' ? (
                                <p>Carbs {Math.round(hovered.event.carbsG)} g</p>
                            ) : hovered.event.type === 'water' ? (
                                <p>
                                    Drink {Math.round(hovered.event.drinkMl)} ml · Sodium {Math.round(hovered.event.sodiumMg)} mg
                                </p>
                            ) : (
                                <p>
                                    Drink {Math.round(hovered.event.drinkMl)} ml · Carbs {Math.round(hovered.event.carbsG)} g · Sodium{' '}
                                    {Math.round(hovered.event.sodiumMg)} mg
                                </p>
                            )}
                            {hovered.event.note ? <p className="timeline-note">{hovered.event.note}</p> : null}
                        </>
                    ) : (
                        <>
                            <p>
                                <strong>Refill bottles</strong> · {formatTime(hovered.event.timeMin)}
                            </p>
                            <p>
                                {hovered.event.km.toFixed(1)} km · Fill to {Math.round(hovered.event.refillMl)} ml
                            </p>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    )
}

function ElevationChart({ route, events, refillEvents }: RouteTimelineProps) {
    const data = useMemo(() => buildElevationData(route.points), [route.points])
    return (
        <div className="elevation-card">
            <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                    <XAxis
                        dataKey="km"
                        type="number"
                        domain={[0, Math.round(route.distanceKm)]}
                        tickFormatter={(v) => (typeof v === "number" ? Math.round(v) : v)}
                        label={{ value: 'km', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis label={{ value: 'm', angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                        formatter={(value) => (typeof value === 'number' ? Math.round(value) : value)}
                        labelFormatter={(value) => `${Number(value).toFixed(1)} km`}
                    />
                    <Area type="monotone" dataKey="ele" stroke={ORANGE} fill="rgba(232, 84, 10, 0.15)" />
                    {events.map((event, index) => (
                        <ReferenceLine
                            key={`${event.km}-${index}`}
                            x={event.km}
                            stroke={event.type === 'combined' ? PURPLE : event.type === 'food' ? ORANGE : BLUE}
                            strokeDasharray={event.type === 'combined' ? undefined : '3 3'}
                        />
                    ))}
                    {refillEvents.map((event, index) => (
                        <ReferenceLine
                            key={`refill-${event.km}-${index}`}
                            x={event.km}
                            stroke={REFILL_BLUE}
                            strokeWidth={2}
                        />
                    ))}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}

export function RouteTimeline({ route, events, refillEvents }: RouteTimelineProps) {
    return (
        <div className="route-timeline">
            <TimelineStrip route={route} events={events} refillEvents={refillEvents} />
            <ElevationChart route={route} events={events} refillEvents={refillEvents} />
        </div>
    )
}
