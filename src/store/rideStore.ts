import { create } from 'zustand'

import { calculatePlan, getOptimalTargets } from '../lib/nutritionEngine'
import { loadFoodLibrary, saveFoodLibrary } from '../lib/foodLibrary'
import type {
    FoodItem,
    GpxRoute,
    NutritionPlan,
    NutritionTargets,
    RiderProfile,
    RideConditions
} from '../types'

type RideStoreState = {
    route: GpxRoute | null
    rider: RiderProfile
    targets: NutritionTargets
    conditions: RideConditions
    foodLibrary: FoodItem[]
    plan: NutritionPlan | null
    weatherError: string | null
    setRoute: (route: GpxRoute) => void
    setRider: (fields: Partial<RiderProfile>) => void
    setTargets: (fields: Partial<NutritionTargets>) => void
    applyOptimalTargets: () => void
    setConditions: (fields: Partial<RideConditions>) => void
    setFoodLibrary: (items: FoodItem[]) => void
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
    refuelIntervalMin: 30,
    intensity: 'moderate'
}

const DEFAULT_CONDITIONS: RideConditions = {
    tempC: 20,
    humidityPct: 50,
    windKmh: 0,
    isHeadwind: false
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
    setWeatherError: (msg) => {
        set({ weatherError: msg })
    },
    recalculate: () => {
        const { route, rider, targets, conditions, foodLibrary } = get()
        if (!route) {
            set({ plan: null })
            return
        }
        const plan = calculatePlan(route, rider, targets, conditions, foodLibrary)
        set({ plan })
    }
}))
