import { create } from 'zustand'

import { calculatePlan, getOptimalTargets } from '../lib/nutritionEngine'
import { loadFoodLibrary, saveFoodLibrary } from '../lib/foodLibrary'
import type {
    FoodItem,
    GpxRoute,
    NutritionPlan,
    NutritionTargets,
    RideKitItem,
    RiderProfile,
    RideConditions
} from '../types'

type RideStoreState = {
    route: GpxRoute | null
    rider: RiderProfile
    targets: NutritionTargets
    conditions: RideConditions
    foodLibrary: FoodItem[]
    rideKit: RideKitItem[]
    plan: NutritionPlan | null
    weatherError: string | null
    setRoute: (route: GpxRoute) => void
    setRider: (fields: Partial<RiderProfile>) => void
    setTargets: (fields: Partial<NutritionTargets>) => void
    applyOptimalTargets: () => void
    setConditions: (fields: Partial<RideConditions>) => void
    setFoodLibrary: (items: FoodItem[]) => void
    setRideKitItem: (foodId: string, quantity: number) => void
    removeRideKitItem: (foodId: string) => void
    setWeatherError: (msg: string | null) => void
    recalculate: () => void
}

const RIDER_STORAGE_KEY = 'velofuel_rider'
const TARGETS_STORAGE_KEY = 'velofuel_targets'

const DEFAULT_RIDER: RiderProfile = {
    weightKg: 75,
    heightCm: 175,
    age: 30,
    sex: 'male',
    waterCapacityMl: 1500
}

const DEFAULT_TARGETS: NutritionTargets = {
    carbsGPerHr: 60,
    sodiumMgPerHr: 700,
    foodIntervalMin: 30,
    waterIntervalMin: 20,
    intensity: 'moderate'
}

const DEFAULT_CONDITIONS: RideConditions = {
    tempC: 20,
    humidityPct: 50,
    windKmh: 0,
    isHeadwind: false
}

function clampQuantity(value: number): number {
    if (!isFinite(value)) {
        return 1
    }
    return Math.min(20, Math.max(1, Math.round(value)))
}

function loadStored<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) {
            return null
        }
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

function saveStored<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // ignore storage errors
    }
}

function loadRider(): RiderProfile {
    const stored = loadStored<Partial<RiderProfile>>(RIDER_STORAGE_KEY)
    return { ...DEFAULT_RIDER, ...(stored ?? {}) }
}

function loadTargets(): NutritionTargets {
    const stored = loadStored<Partial<NutritionTargets>>(TARGETS_STORAGE_KEY)
    return { ...DEFAULT_TARGETS, ...(stored ?? {}) }
}

export const useRideStore = create<RideStoreState>((set, get) => ({
    route: null,
    rider: loadRider(),
    targets: loadTargets(),
    conditions: DEFAULT_CONDITIONS,
    foodLibrary: loadFoodLibrary(),
    rideKit: [],
    plan: null,
    weatherError: null,
    setRoute: (route) => {
        set({ route })
        get().recalculate()
    },
    setRider: (fields) => {
        set((state) => {
            const rider = { ...state.rider, ...fields }
            saveStored(RIDER_STORAGE_KEY, rider)
            return { rider }
        })
        get().recalculate()
    },
    setTargets: (fields) => {
        set((state) => {
            const targets = { ...state.targets, ...fields }
            saveStored(TARGETS_STORAGE_KEY, targets)
            return { targets }
        })
        get().recalculate()
    },
    applyOptimalTargets: () => {
        const optimal = getOptimalTargets(get().targets.intensity)
        get().setTargets(optimal)
        get().recalculate()
    },
    setConditions: (fields) => {
        set((state) => ({ conditions: { ...state.conditions, ...fields } }))
        get().recalculate()
    },
    setFoodLibrary: (items) => {
        saveFoodLibrary(items)
        set({ foodLibrary: items })
        get().recalculate()
    },
    setRideKitItem: (foodId, quantity) => {
        set((state) => {
            const nextQuantity = clampQuantity(quantity)
            const existing = state.rideKit.find((item) => item.foodId === foodId)
            if (existing) {
                return {
                    rideKit: state.rideKit.map((item) =>
                        item.foodId === foodId ? { ...item, quantity: nextQuantity } : item
                    )
                }
            }
            return { rideKit: [...state.rideKit, { foodId, quantity: nextQuantity }] }
        })
        get().recalculate()
    },
    removeRideKitItem: (foodId) => {
        set((state) => ({ rideKit: state.rideKit.filter((item) => item.foodId !== foodId) }))
        get().recalculate()
    },
    setWeatherError: (msg) => {
        set({ weatherError: msg })
    },
    recalculate: () => {
        const { route, rider, targets, conditions, foodLibrary, rideKit } = get()
        if (!route) {
            set({ plan: null })
            return
        }
        const plan = calculatePlan(route, rider, targets, conditions, foodLibrary, rideKit)
        set({ plan })
    }
}))
