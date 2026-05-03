import type { GpxPoint, RideConditions } from '../types'

function toRadians(deg: number): number {
    return (deg * Math.PI) / 180
}

/**
 * Calculate bearing in degrees (0-360) from point A to point B.
 */
export function calcBearing(a: GpxPoint, b: GpxPoint): number {
    const lat1 = toRadians(a.lat)
    const lat2 = toRadians(b.lat)
    const dLon = toRadians(b.lon - a.lon)
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    const bearingDeg = (Math.atan2(y, x) * 180) / Math.PI
    return (bearingDeg + 360) % 360
}

function angularDifference(a: number, b: number): number {
    const diff = Math.abs(a - b) % 360
    return diff > 180 ? 360 - diff : diff
}

/**
 * Fetch weather data from Open-Meteo and map to ride conditions.
 */
export async function fetchWeather(
    lat: number,
    lon: number,
    startTime: Date,
    routeBearingDeg?: number
): Promise<RideConditions> {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('hourly', 'temperature_2m,relativehumidity_2m,windspeed_10m,winddirection_10m')
    url.searchParams.set('forecast_days', '3')

    let response: Response
    try {
        response = await fetch(url.toString())
    } catch (error) {
        throw new Error('Weather fetch failed: network error', { cause: error })
    }

    if (!response.ok) {
        throw new Error(`Weather fetch failed: ${response.status} ${response.statusText}`)
    }

    let payload: unknown
    try {
        payload = await response.json()
    } catch (error) {
        throw new Error('Weather fetch failed: invalid JSON response', { cause: error })
    }

    const data = payload as {
        hourly?: {
            time?: string[]
            temperature_2m?: number[]
            relativehumidity_2m?: number[]
            windspeed_10m?: number[]
            winddirection_10m?: number[]
        }
    }

    const times = data.hourly?.time ?? []
    const temps = data.hourly?.temperature_2m ?? []
    const humidities = data.hourly?.relativehumidity_2m ?? []
    const winds = data.hourly?.windspeed_10m ?? []
    const windDirs = data.hourly?.winddirection_10m ?? []

    if (!times.length) {
        throw new Error('Weather fetch failed: no hourly data returned')
    }

    const startMs = startTime.getTime()
    const firstMs = new Date(times[0]).getTime()
    const lastMs = new Date(times[times.length - 1]).getTime()
    if (!isFinite(startMs) || startMs < firstMs || startMs > lastMs) {
        throw new Error('Weather fetch failed: start time outside forecast window')
    }

    let closestIndex = 0
    let closestDelta = Number.POSITIVE_INFINITY
    for (let i = 0; i < times.length; i += 1) {
        const timeMs = new Date(times[i]).getTime()
        const delta = Math.abs(timeMs - startMs)
        if (delta < closestDelta) {
            closestDelta = delta
            closestIndex = i
        }
    }

    const tempC = temps[closestIndex]
    const humidityPct = humidities[closestIndex]
    const windKmh = winds[closestIndex]
    const windDirDeg = windDirs[closestIndex]

    if (
        tempC === undefined ||
        humidityPct === undefined ||
        windKmh === undefined ||
        windDirDeg === undefined
    ) {
        throw new Error('Weather fetch failed: incomplete hourly data at start time')
    }

    const isHeadwind =
        routeBearingDeg !== undefined &&
        angularDifference((routeBearingDeg + 180) % 360, windDirDeg) <= 45

    return {
        tempC,
        humidityPct: Math.min(100, Math.max(0, humidityPct)),
        windKmh,
        isHeadwind
    }
}