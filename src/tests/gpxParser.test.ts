import { describe, expect, it } from 'vitest'

import { parseGpx } from '../lib/gpxParser'

function buildTrkGpx(points: Array<{ lat: number; lon: number; ele?: number; time?: string }>): string {
    const trkpts = points
        .map((point) => {
            const ele = point.ele !== undefined ? `<ele>${point.ele}</ele>` : ''
            const time = point.time ? `<time>${point.time}</time>` : ''
            return `<trkpt lat="${point.lat}" lon="${point.lon}">${ele}${time}</trkpt>`
        })
        .join('')
    return `<?xml version="1.0" encoding="UTF-8"?><gpx><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
}

function buildMultiSegGpx(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx>
	<trk>
		<trkseg>
			<trkpt lat="0" lon="0"><ele>0</ele></trkpt>
			<trkpt lat="0.01" lon="0"><ele>5</ele></trkpt>
		</trkseg>
		<trkseg>
			<trkpt lat="0.02" lon="0"><ele>10</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`
}

function buildRteGpx(points: Array<{ lat: number; lon: number; ele?: number; time?: string }>): string {
    const rtepts = points
        .map((point) => {
            const ele = point.ele !== undefined ? `<ele>${point.ele}</ele>` : ''
            const time = point.time ? `<time>${point.time}</time>` : ''
            return `<rtept lat="${point.lat}" lon="${point.lon}">${ele}${time}</rtept>`
        })
        .join('')
    return `<?xml version="1.0" encoding="UTF-8"?><gpx><rte>${rtepts}</rte></gpx>`
}

describe('parseGpx', () => {
    it('parses valid trk GPX with distance and elevation', () => {
        const gpx = buildTrkGpx([
            { lat: 0, lon: 0, ele: 0 },
            { lat: 0.01, lon: 0, ele: 5 },
            { lat: 0.02, lon: 0, ele: 8 }
        ])
        const route = parseGpx(gpx)
        expect(route.points.length).toBe(3)
        expect(route.distanceKm).toBeGreaterThan(0)
        expect(route.elevationGainM).toBeGreaterThanOrEqual(0)
    })

    it('parses valid rte GPX with distance and elevation', () => {
        const gpx = buildRteGpx([
            { lat: 0, lon: 0, ele: 0 },
            { lat: 0.01, lon: 0, ele: 5 },
            { lat: 0.02, lon: 0, ele: 8 }
        ])
        const route = parseGpx(gpx)
        expect(route.points.length).toBe(3)
        expect(route.distanceKm).toBeGreaterThan(0)
        expect(route.elevationGainM).toBeGreaterThanOrEqual(0)
    })

    it('concatenates points across multiple track segments', () => {
        const route = parseGpx(buildMultiSegGpx())
        expect(route.points.length).toBe(3)
    })

    it('defaults missing elevation to 0', () => {
        const gpx = buildTrkGpx([
            { lat: 0, lon: 0 },
            { lat: 0.01, lon: 0 }
        ])
        const route = parseGpx(gpx)
        expect(route.points.every((point) => point.ele === 0)).toBe(true)
    })

    it('throws on invalid XML', () => {
        expect(() => parseGpx('<gpx><trk>')).toThrow('Invalid GPX XML')
    })

    it('throws when no track or route points are found', () => {
        expect(() => parseGpx('<?xml version="1.0"?><gpx><trk></trk></gpx>')).toThrow(
            'no track or route points'
        )
    })

    it('sets duration when time elements are present', () => {
        const gpx = buildTrkGpx([
            { lat: 0, lon: 0, time: '2026-05-03T10:00:00Z' },
            { lat: 0.01, lon: 0, time: '2026-05-03T11:00:00Z' }
        ])
        const route = parseGpx(gpx)
        expect(route.durationHr).toBeDefined()
        expect(route.durationHr ?? 0).toBeGreaterThan(0)
    })

    it('leaves duration undefined when no time elements are present', () => {
        const gpx = buildTrkGpx([
            { lat: 0, lon: 0 },
            { lat: 0.01, lon: 0 }
        ])
        const route = parseGpx(gpx)
        expect(route.durationHr).toBeUndefined()
    })
})
