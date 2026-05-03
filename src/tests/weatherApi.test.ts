import { afterEach, describe, expect, it, vi } from 'vitest'

import { calcBearing, fetchWeather } from '../lib/weatherApi'
import type { RideConditions } from '../types'

afterEach(() => {
    vi.restoreAllMocks()
})

function stubFetch(payload: unknown, ok = true): void {
    const response = {
        ok,
        status: ok ? 200 : 500,
        statusText: ok ? 'OK' : 'Server Error',
        json: async () => payload
    } as Response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('calcBearing', () => {
    it('matches Hamburg to Munich bearing roughly southward', () => {
        const hamburg = { lat: 53.55, lon: 10.0, ele: 0 }
        const munich = { lat: 48.13, lon: 11.58, ele: 0 }
        const bearing = calcBearing(hamburg, munich)
        expect(bearing).toBeGreaterThan(164)
        expect(bearing).toBeLessThan(174)
    })

    it('returns a finite value for identical points', () => {
        const point = { lat: 53.55, lon: 10.0, ele: 0 }
        const bearing = calcBearing(point, point)
        expect(Number.isFinite(bearing)).toBe(true)
    })
})

describe('fetchWeather', () => {
    it('maps Open-Meteo response to ride conditions', async () => {
        const payload = {
            hourly: {
                time: ['2026-05-03T09:00:00Z', '2026-05-03T10:00:00Z', '2026-05-03T11:00:00Z'],
                temperature_2m: [16, 18, 19],
                relativehumidity_2m: [40, 55, 60],
                windspeed_10m: [8, 12, 10],
                winddirection_10m: [90, 0, 45]
            }
        }
        stubFetch(payload)
        const startTime = new Date('2026-05-03T10:20:00Z')
        const result = await fetchWeather(53.55, 10.0, startTime, 180)
        const expected: RideConditions = {
            tempC: 18,
            humidityPct: 55,
            windKmh: 12,
            isHeadwind: true
        }
        expect(result).toEqual(expected)
    })

    it('rejects with network error when fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
        await expect(fetchWeather(53.55, 10.0, new Date())).rejects.toThrow('network error')
    })

    it('rejects when start time is outside the forecast window', async () => {
        const payload = {
            hourly: {
                time: ['2026-05-03T09:00:00Z', '2026-05-03T10:00:00Z'],
                temperature_2m: [16, 18],
                relativehumidity_2m: [40, 55],
                windspeed_10m: [8, 12],
                winddirection_10m: [90, 0]
            }
        }
        stubFetch(payload)
        const startTime = new Date('2026-05-05T10:00:00Z')
        await expect(fetchWeather(53.55, 10.0, startTime)).rejects.toThrow('outside forecast window')
    })
})
