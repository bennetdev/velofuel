import type { GpxPoint, GpxRoute } from '../types'

/** Convert degrees to radians. */
function toRadians(deg: number): number {
    return (deg * Math.PI) / 180
}

/** Compute the great-circle distance between two points in kilometers. */
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

/** Parse a GPX track/route point element into a normalized point. */
function parsePoint(element: Element): GpxPoint | null {
    const latAttr = element.getAttribute('lat')
    const lonAttr = element.getAttribute('lon')
    if (!latAttr || !lonAttr) {
        return null
    }
    const lat = Number(latAttr)
    const lon = Number(lonAttr)
    if (!isFinite(lat) || !isFinite(lon)) {
        return null
    }
    const eleText = element.querySelector('ele')?.textContent
    const ele = eleText ? Number(eleText) : 0
    const timeText = element.querySelector('time')?.textContent
    const time = timeText ? new Date(timeText) : undefined
    return { lat, lon, ele: isFinite(ele) ? ele : 0, time: time && !isNaN(time.getTime()) ? time : undefined }
}

/** Collect and concatenate track points across all track segments. */
function collectTrackPoints(doc: Document): GpxPoint[] {
    const points: GpxPoint[] = []
    const segments = Array.from(doc.querySelectorAll('trk > trkseg'))
    for (const segment of segments) {
        const trkpts = Array.from(segment.querySelectorAll('trkpt'))
        for (const trkpt of trkpts) {
            const point = parsePoint(trkpt)
            if (point) {
                points.push(point)
            }
        }
    }
    return points
}

/** Collect route points from a planned route track. */
function collectRoutePoints(doc: Document): GpxPoint[] {
    const points: GpxPoint[] = []
    const rtepts = Array.from(doc.querySelectorAll('rte > rtept'))
    for (const rtept of rtepts) {
        const point = parsePoint(rtept)
        if (point) {
            points.push(point)
        }
    }
    return points
}

/** Sum haversine distances between consecutive points. */
function computeDistanceKm(points: GpxPoint[]): number {
    let distanceKm = 0
    for (let i = 1; i < points.length; i += 1) {
        distanceKm += haversineKm(points[i - 1], points[i])
    }
    return distanceKm
}

/** Sum positive elevation deltas, ignoring sub-2m noise. */
function computeElevationGainM(points: GpxPoint[]): number {
    let gainM = 0
    for (let i = 1; i < points.length; i += 1) {
        const delta = points[i].ele - points[i - 1].ele
        if (delta > 2) {
            gainM += delta
        }
    }
    return gainM
}

/** Compute duration from first to last timestamp when present. */
function computeDurationHr(points: GpxPoint[]): number | undefined {
    let firstTime: Date | undefined
    let lastTime: Date | undefined
    for (const point of points) {
        if (!point.time) {
            continue
        }
        if (!firstTime) {
            firstTime = point.time
        }
        lastTime = point.time
    }
    if (!firstTime || !lastTime) {
        return undefined
    }
    const durationMs = lastTime.getTime() - firstTime.getTime()
    if (!isFinite(durationMs) || durationMs <= 0) {
        return undefined
    }
    return durationMs / 36e5
}

/** Parse GPX XML into route points, distance, elevation gain, and duration. */
export function parseGpx(xmlString: string): GpxRoute {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, 'text/xml')
    if (doc.querySelector('parsererror')) {
        throw new Error('Invalid GPX XML: parser error')
    }

    const trackPoints = collectTrackPoints(doc)
    const points = trackPoints.length ? trackPoints : collectRoutePoints(doc)
    if (!points.length) {
        throw new Error('GPX contains no track or route points')
    }

    const distanceKm = computeDistanceKm(points)
    const elevationGainM = computeElevationGainM(points)
    const durationHr = computeDurationHr(points)

    return {
        points,
        distanceKm,
        elevationGainM,
        durationHr
    }
}