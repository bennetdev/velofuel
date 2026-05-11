import type {
    FoodItem,
    GpxPoint,
    GpxRoute,
    NutritionPlan,
    NutritionTargets,
    PackingItem,
    RefillEvent,
    RefuelEvent,
    RideKitItem,
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

export function getOptimalTargets(
    intensity: Intensity
): Pick<NutritionTargets, 'carbsGPerHr' | 'sodiumMgPerHr' | 'foodIntervalMin' | 'waterIntervalMin'> {
    if (intensity === 'easy') {
        return { carbsGPerHr: 40, sodiumMgPerHr: 400, foodIntervalMin: 45, waterIntervalMin: 30 }
    }
    if (intensity === 'hard') {
        return { carbsGPerHr: 90, sodiumMgPerHr: 1000, foodIntervalMin: 20, waterIntervalMin: 15 }
    }
    return { carbsGPerHr: 60, sodiumMgPerHr: 700, foodIntervalMin: 30, waterIntervalMin: 20 }
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

function resolveEventType(carbsG: number, drinkMl: number, sodiumMg: number): RefuelEvent['type'] {
    const hasFood = carbsG > 0
    const hasWater = drinkMl > 0 || sodiumMg > 0
    if (hasFood && hasWater) {
        return 'combined'
    }
    if (hasFood) {
        return 'food'
    }
    return 'water'
}

function mergeNearbyEvents(route: GpxRoute, events: RefuelEvent[], totalMinutes: number): RefuelEvent[] {
    const sorted = events.slice().sort((a, b) => a.km - b.km)
    const merged: RefuelEvent[] = []
    const distanceKm = route.distanceKm || 0

    for (const event of sorted) {
        const last = merged[merged.length - 1]
        if (last && Math.abs(event.km - last.km) <= 2) {
            const km = Math.min(last.km, event.km)
            const carbsG = last.carbsG + event.carbsG
            const drinkMl = last.drinkMl + event.drinkMl
            const sodiumMg = last.sodiumMg + event.sodiumMg
            const timeMin = distanceKm > 0 ? (km / distanceKm) * totalMinutes : Math.min(last.timeMin, event.timeMin)
            merged[merged.length - 1] = {
                km,
                timeMin,
                carbsG,
                drinkMl,
                sodiumMg,
                type: resolveEventType(carbsG, drinkMl, sodiumMg),
                note: last.note ?? event.note
            }
            continue
        }
        merged.push(event)
    }

    return merged
}

/**
 * Create food events on a fixed interval, shifting earlier when a climb is imminent.
 */
export function generateFoodEvents(route: GpxRoute, targets: NutritionTargets, kcalPerHr: number): RefuelEvent[] {
    if (!route.points.length) {
        return []
    }
    void kcalPerHr
    const durationHr = estimateDurationHr(route, targets.intensity)
    if (durationHr <= 0) {
        return []
    }
    const totalMinutes = durationHr * 60
    const intervalMin = targets.foodIntervalMin
    if (intervalMin <= 0) {
        return []
    }
    const avgSpeedKmPerHr = route.distanceKm / durationHr
    if (!isFinite(avgSpeedKmPerHr) || avgSpeedKmPerHr <= 0) {
        return []
    }

    const distancesKm = buildCumulativeDistancesKm(route.points)
    const events: RefuelEvent[] = []

    for (let timeMin = intervalMin; timeMin <= totalMinutes - intervalMin * 0.1; timeMin += intervalMin) {
        const intervalHr = intervalMin / 60
        const carbsG = targets.carbsGPerHr * intervalHr
        const drinkMl = 0
        const sodiumMg = 0

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
            type: 'food',
            note
        })
    }

    return events
}

/**
 * Create water events on a fixed interval without shifting for climbs.
 */
export function generateWaterEvents(route: GpxRoute, targets: NutritionTargets, sweatRateMlPerHr: number): RefuelEvent[] {
    if (!route.points.length) {
        return []
    }
    const durationHr = estimateDurationHr(route, targets.intensity)
    if (durationHr <= 0) {
        return []
    }
    const totalMinutes = durationHr * 60
    const intervalMin = targets.waterIntervalMin
    if (intervalMin <= 0) {
        return []
    }
    const avgSpeedKmPerHr = route.distanceKm / durationHr
    if (!isFinite(avgSpeedKmPerHr) || avgSpeedKmPerHr <= 0) {
        return []
    }

    const events: RefuelEvent[] = []

    for (let timeMin = intervalMin; timeMin <= totalMinutes - intervalMin * 0.1; timeMin += intervalMin) {
        const intervalHr = intervalMin / 60
        const drinkMl = sweatRateMlPerHr * intervalHr
        const carbsG = 0
        const sodiumMg = targets.sodiumMgPerHr * intervalHr

        const km = avgSpeedKmPerHr * (timeMin / 60)
        if (km > route.distanceKm) {
            break
        }

        const adjustedTimeMin = route.distanceKm > 0 ? (km / route.distanceKm) * totalMinutes : 0

        events.push({
            km,
            timeMin: adjustedTimeMin,
            drinkMl,
            carbsG,
            sodiumMg,
            type: 'water'
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

export function derivePackingListFromKit(
    totalCarbsG: number,
    rideKit: RideKitItem[],
    foodLibrary: FoodItem[]
): { items: PackingItem[]; remainingCarbsG: number } {
    const kitById = new Map(rideKit.map((item) => [item.foodId, item.quantity]))
    const candidates = foodLibrary
        .map((food) => {
            const quantity = kitById.get(food.id)
            if (!quantity || quantity <= 0) {
                return null
            }
            return { food, quantity }
        })
        .filter((entry): entry is { food: FoodItem; quantity: number } => Boolean(entry))
        .sort((a, b) => {
            const densityA = a.food.weightG > 0 ? a.food.carbsG / a.food.weightG : a.food.carbsG
            const densityB = b.food.weightG > 0 ? b.food.carbsG / b.food.weightG : b.food.carbsG
            return densityB - densityA
        })

    const items: PackingItem[] = []
    let remainingCarbsG = totalCarbsG

    for (const candidate of candidates) {
        if (remainingCarbsG <= 0) {
            break
        }
        const carbsPerItem = candidate.food.carbsG
        if (carbsPerItem <= 0) {
            continue
        }
        const countNeeded = Math.ceil(remainingCarbsG / carbsPerItem)
        const count = Math.min(candidate.quantity, Math.max(0, countNeeded))
        if (count <= 0) {
            continue
        }
        remainingCarbsG -= count * carbsPerItem
        items.push({ name: candidate.food.name, quantity: count, unit: 'x' })
    }

    return { items, remainingCarbsG: Math.max(0, Math.round(remainingCarbsG)) }
}

export function calcKitCoverage(
    rideKit: RideKitItem[],
    foodLibrary: FoodItem[],
    plan: NutritionPlan
): { kitCarbsG: number; kitWaterMl: number; kitCoverageWarning: string | null } {
    let kitCarbsG = 0
    let kitWaterMl = 0
    for (const kitItem of rideKit) {
        const match = foodLibrary.find((food) => food.id === kitItem.foodId)
        if (!match) {
            continue
        }
        kitCarbsG += match.carbsG * kitItem.quantity
        kitWaterMl += match.waterMl * kitItem.quantity
    }

    kitCarbsG = Math.round(kitCarbsG)
    kitWaterMl = Math.round(kitWaterMl)

    const targetCarbsG = plan.totalCarbsG
    const carbsShortG = Math.max(0, Math.round(targetCarbsG - kitCarbsG))

    let kitCoverageWarning: string | null = null
    if (carbsShortG > 0) {
        kitCoverageWarning = `Kit short by ${carbsShortG}g carbs`
    }

    return { kitCarbsG, kitWaterMl, kitCoverageWarning }
}

export function generateRefillEvents(
    events: RefuelEvent[],
    waterCapacityMl: number,
    route: GpxRoute
): RefillEvent[] {
    const totalWaterMl = events.reduce((sum, event) => sum + event.drinkMl, 0)
    if (waterCapacityMl <= 0 || totalWaterMl <= waterCapacityMl) {
        return []
    }
    const durationHr = estimateDurationHr(route, 'moderate')
    const totalMinutes = durationHr > 0 ? durationHr * 60 : 0
    const refillEvents: RefillEvent[] = []
    let currentWaterMl = waterCapacityMl

    for (const event of events) {
        currentWaterMl -= event.drinkMl
        if (currentWaterMl < 200) {
            const timeMin = route.distanceKm > 0 ? (event.km / route.distanceKm) * totalMinutes : 0
            refillEvents.push({
                km: event.km,
                timeMin,
                refillMl: waterCapacityMl
            })
            currentWaterMl = waterCapacityMl
        }
    }

    return refillEvents
}

/**
 * Master nutrition planner that computes totals, events, and packing list.
 */
export function calculatePlan(
    route: GpxRoute,
    rider: RiderProfile,
    targets: NutritionTargets,
    conditions: RideConditions,
    foodLibrary: FoodItem[],
    rideKit: RideKitItem[]
): NutritionPlan {
    const estDurationHr = estimateDurationHr(route, targets.intensity)
    const sweatRateMlPerHr = calcSweatRateMlPerHr(rider, conditions, targets.intensity)
    const kcalPerHr = calcKcalPerHr(rider, targets.intensity, route.elevationGainM, estDurationHr)
    const durationMinutes = estDurationHr * 60
    const foodEvents = generateFoodEvents(route, targets, kcalPerHr)
    const waterEvents = generateWaterEvents(route, targets, sweatRateMlPerHr)
    const events = mergeNearbyEvents(route, [...foodEvents, ...waterEvents], durationMinutes)
    const totalCarbsG = events.reduce((sum, event) => sum + event.carbsG, 0)
    const allocation = derivePackingListFromKit(totalCarbsG, rideKit, foodLibrary)
    const packingList = buildPackingList(events, allocation.items)
    const refillEvents = generateRefillEvents(events, rider.waterCapacityMl, route)

    const totalSodiumMg = events.reduce((sum, event) => sum + event.sodiumMg, 0)
    const totalWaterL = events.reduce((sum, event) => sum + event.drinkMl, 0) / 1000
    const totalKcal = kcalPerHr * estDurationHr
    const warningMessages: string[] = []
    if (estDurationHr > 1 && targets.carbsGPerHr < 30) {
        warningMessages.push('Carb intake below 30 g/hr for a ride over 1 hour — under-fuelling likely.')
    }
    if (estDurationHr > 2.5 && targets.carbsGPerHr < 60) {
        warningMessages.push('Rides over 2.5 hours benefit from at least 60 g/hr carbohydrate intake.')
    }
    const warning = warningMessages.length ? warningMessages.join(' ') : undefined

    const planSnapshot: NutritionPlan = {
        totalKcal,
        totalWaterL,
        totalCarbsG,
        totalSodiumMg,
        sweatRateMlPerHr,
        estDurationHr,
        events,
        refillEvents,
        packingList,
        kitCarbsG: 0,
        kitWaterMl: 0,
        kitCoverageWarning: null,
        warning
    }

    const kitCoverage = calcKitCoverage(rideKit, foodLibrary, planSnapshot)

    return {
        ...planSnapshot,
        ...kitCoverage
    }
}