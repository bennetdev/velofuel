// Raw GPX data after parsing
export type GpxPoint = { lat: number; lon: number; ele: number; time?: Date }
export type GpxRoute = { points: GpxPoint[]; distanceKm: number; elevationGainM: number; durationHr?: number }

// Rider
export type RiderProfile = { weightKg: number; heightCm: number; age: number; sex: 'male' | 'female'; waterCapacityMl: number }

// Ride settings (the sliders)
export type NutritionTargets = {
    carbsGPerHr: number         // 30–120
    sodiumMgPerHr: number       // 200–1500
    foodIntervalMin: number     // 15–60
    waterIntervalMin: number    // 10–45
    intensity: 'easy' | 'moderate' | 'hard'
}

// Conditions (from weather API or manual)
export type RideConditions = {
    tempC: number
    humidityPct: number         // 0–100
    windKmh: number
    isHeadwind: boolean
}

// A single refuel event on the timeline
export type RefuelEvent = {
    km: number
    timeMin: number
    carbsG: number
    drinkMl: number
    sodiumMg: number
    type: 'food' | 'water' | 'combined'
    note?: string
}

export type RefillEvent = {
    km: number
    timeMin: number
    refillMl: number
}

export type RideKitItem = {
    foodId: string
    quantity: number
}

// Full output
export type NutritionPlan = {
    totalKcal: number
    totalWaterL: number
    totalCarbsG: number
    totalSodiumMg: number
    sweatRateMlPerHr: number
    estDurationHr: number
    events: RefuelEvent[]
    refillEvents: RefillEvent[]
    packingList: PackingItem[]  // derived: "3 gels, 2 bars, 1.8L water"
    kitCarbsG: number
    kitWaterMl: number
    kitCoverageWarning: string | null
    warning?: string
}

export type PackingItem = { name: string; quantity: number; unit: string }

// Food library
export type FoodItem = {
    id: string
    name: string
    weightG: number
    kcal: number
    carbsG: number
    sodiumMg: number
    waterMl: number             // some foods contribute hydration (fruit, rice cakes)
    isPreset: boolean
    version?: number
}