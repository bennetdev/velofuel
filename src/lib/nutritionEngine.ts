import type {
    FoodItem,
    GpxPoint,
    GpxRoute,
    NutritionPlan,
    NutritionTargets,
    PackingItem,
    RefuelEvent,
    RiderProfile,
    RideConditions
} from '../types'

type Intensity = NutritionTargets['intensity']

const MET_BY_INTENSITY: Record<Intensity, number> = {
    easy: 6.0,
    moderate: 8.5,
    hard: 11.5
}

const SPEED_BY_INTENSITY: Record<Intensity, number> = {
    easy: 20,
    moderate: 25,
    hard: 30
}

const INTENSITY_MULTIPLIER: Record<Intensity, number> = {
    easy: 0.8,
    moderate: 1.0,
    hard: 1.25
}

/** Clamp a numeric value to an inclusive range. */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

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

/** Build cumulative distance (km) for each GPX point along the route. */
function buildCumulativeDistancesKm(points: GpxPoint[]): number[] {
    const distances: number[] = []
    let total = 0
    for (let i = 0; i < points.length; i += 1) {
        if (i > 0) {
            total += haversineKm(points[i - 1], points[i])
        }
        distances.push(total)
    }
    return distances
}

/** Sum positive elevation deltas between start and end distance windows. */
function cumulativeAscentInWindow(points: GpxPoint[], distancesKm: number[], startKm: number, endKm: number): number {
    if (points.length < 2) {
        return 0
    }
    let startIndex = -1
    let endIndex = -1
    for (let i = 0; i < distancesKm.length; i += 1) {
        const km = distancesKm[i]
        if (startIndex === -1 && km >= startKm) {
            startIndex = i
        }
        if (km <= endKm) {
            endIndex = i
        }
    }
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        return 0
    }
    let ascentM = 0
    for (let i = startIndex + 1; i <= endIndex; i += 1) {
        const delta = points[i].ele - points[i - 1].ele
        if (delta > 0) {
            ascentM += delta
        }
    }
    return ascentM
}

/** Estimate duration using GPX duration when available or a speed-by-intensity fallback. */
function estimateDurationHr(route: GpxRoute, intensity: Intensity): number {
    if (route.durationHr && route.durationHr > 0) {
        return route.durationHr
    }
    if (!route.distanceKm || route.distanceKm <= 0) {
        return 0
    }
    return route.distanceKm / SPEED_BY_INTENSITY[intensity]
}

/**
 * Estimate energy burn per hour from METs, rider weight, and average ascent per hour.
 */
export function calcKcalPerHr(rider: RiderProfile, intensity: Intensity, elevationGainM: number, durationHr: number): number {
    const met = MET_BY_INTENSITY[intensity]
    const base = met * rider.weightKg * 1.05
    const ascentPerHr = durationHr > 0 ? elevationGainM / durationHr : 0
    const elevationAdd = (ascentPerHr / 100) * 10
    return base + elevationAdd
}

/**
 * Estimate sweat rate (ml/hr) using temperature, humidity, sex, and headwind modifiers.
 */
export function calcSweatRateMlPerHr(rider: RiderProfile, conditions: RideConditions, intensity: Intensity): number {
    let rate = 500
    rate *= INTENSITY_MULTIPLIER[intensity]
    const tempDelta = Math.max(0, conditions.tempC - 15)
    rate += tempDelta * 35
    if (conditions.humidityPct > 70) {
        rate *= 1.15
    }
    if (rider.sex === 'male') {
        rate *= 1.1
    }
    if (conditions.isHeadwind) {
        rate *= 0.92
    }
    return clamp(rate, 300, 2000)
}

/**
 * Create refuel events on a fixed interval, shifting earlier when a climb is imminent.
 */
export function generateEvents(route: GpxRoute, targets: NutritionTargets, sweatRateMlPerHr: number, kcalPerHr: number): RefuelEvent[] {
    if (!route.points.length) {
        return []
    }
    const durationHr = estimateDurationHr(route, targets.intensity)
    if (durationHr <= 0) {
        return []
    }
    const totalMinutes = durationHr * 60
    const intervalMin = targets.refuelIntervalMin
    if (intervalMin <= 0) {
        return []
    }
    const avgSpeedKmPerHr = route.distanceKm / durationHr
    if (!isFinite(avgSpeedKmPerHr) || avgSpeedKmPerHr <= 0) {
        return []
    }

    const distancesKm = buildCumulativeDistancesKm(route.points)
    const events: RefuelEvent[] = []

    for (let timeMin = intervalMin; timeMin <= totalMinutes - intervalMin * 0.5; timeMin += intervalMin) {
        const intervalHr = intervalMin / 60
        const drinkMl = sweatRateMlPerHr * intervalHr
        const carbsG = targets.carbsGPerHr * intervalHr
        const sodiumMg = targets.sodiumMgPerHr * intervalHr

        let km = avgSpeedKmPerHr * (timeMin / 60)
        if (km > route.distanceKm) {
            break
        }
        let note: string | undefined

        const lookaheadStart = km
        const lookaheadEnd = km + 5
        const climbAheadM = cumulativeAscentInWindow(route.points, distancesKm, lookaheadStart, lookaheadEnd)
        if (climbAheadM > 80) {
            km = Math.max(0, km - 3)
            note = 'climb ahead, fuel now'
        }

        const adjustedTimeMin = route.distanceKm > 0 ? (km / route.distanceKm) * totalMinutes : 0

        events.push({
            km,
            timeMin: adjustedTimeMin,
            drinkMl,
            carbsG,
            sodiumMg,
            note
        })
    }

    return events
}

/**
 * Build a greedy packing list using highest carb density foods, plus total water.
 */
export function allocateCarbsGreedy(totalCarbsG: number, foodLibrary: FoodItem[]): { items: PackingItem[]; remainingCarbsG: number } {
    let remainingCarbsG = totalCarbsG
    const candidates = foodLibrary
        .filter((item) => item.carbsG > 0)
        .slice()
        .sort((a, b) => {
            // Sort by carb density to pack the most carbs per gram first.
            const densityA = a.weightG > 0 ? a.carbsG / a.weightG : a.carbsG
            const densityB = b.weightG > 0 ? b.carbsG / b.weightG : b.carbsG
            return densityB - densityA
        })

    const items: PackingItem[] = []
    for (const item of candidates) {
        if (remainingCarbsG <= 0) {
            break
        }
        const carbsPerItem = item.carbsG
        if (carbsPerItem <= 0) {
            continue
        }
        let count = Math.floor(remainingCarbsG / carbsPerItem)
        if (count === 0 && remainingCarbsG > 0) {
            count = 1
        }
        if (count > 0) {
            remainingCarbsG -= count * carbsPerItem
            items.push({ name: item.name, quantity: count, unit: 'x' })
        }
    }

    return { items, remainingCarbsG }
}

function buildPackingList(events: RefuelEvent[], items: PackingItem[]): PackingItem[] {
    const totalWaterMl = events.reduce((sum, event) => sum + event.drinkMl, 0)
    const packingList: PackingItem[] = [...items]

    const totalWaterL = Math.round((totalWaterMl / 1000) * 10) / 10
    if (totalWaterL > 0) {
        packingList.push({ name: 'Water', quantity: totalWaterL, unit: 'L' })
    }

    return packingList
}

export function derivePackingList(events: RefuelEvent[], foodLibrary: FoodItem[]): PackingItem[] {
    const totalCarbsG = events.reduce((sum, event) => sum + event.carbsG, 0)
    const { items } = allocateCarbsGreedy(totalCarbsG, foodLibrary)
    return buildPackingList(events, items)
}

/**
 * Master nutrition planner that computes totals, events, and packing list.
 */
export function calculatePlan(route: GpxRoute, rider: RiderProfile, targets: NutritionTargets, conditions: RideConditions, foodLibrary: FoodItem[]): NutritionPlan {
    const estDurationHr = estimateDurationHr(route, targets.intensity)
    const sweatRateMlPerHr = calcSweatRateMlPerHr(rider, conditions, targets.intensity)
    const kcalPerHr = calcKcalPerHr(rider, targets.intensity, route.elevationGainM, estDurationHr)
    const events = generateEvents(route, targets, sweatRateMlPerHr, kcalPerHr)
    const totalCarbsG = events.reduce((sum, event) => sum + event.carbsG, 0)
    const allocation = allocateCarbsGreedy(totalCarbsG, foodLibrary)
    const packingList = buildPackingList(events, allocation.items)

    const totalSodiumMg = events.reduce((sum, event) => sum + event.sodiumMg, 0)
    const totalWaterL = events.reduce((sum, event) => sum + event.drinkMl, 0) / 1000
    const totalKcal = kcalPerHr * estDurationHr
    const warning = allocation.remainingCarbsG > 0 ? 'Food library does not cover carb target.' : undefined

    return {
        totalKcal,
        totalWaterL,
        totalCarbsG,
        totalSodiumMg,
        sweatRateMlPerHr,
        estDurationHr,
        events,
        packingList,
        warning
    }
}