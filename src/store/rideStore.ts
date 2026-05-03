import { create } from 'zustand'

import { calculatePlan } from '../lib/nutritionEngine'
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
    setConditions: (fields: Partial<RideConditions>) => void
    setFoodLibrary: (items: FoodItem[]) => void
    setWeatherError: (msg: string | null) => void
    recalculate: () => void
}

const DEFAULT_RIDER: RiderProfile = {
    weightKg: 75,
    heightCm: 175,
    age: 30,
    sex: 'male'
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

export const useRideStore = create<RideStoreState>((set, get) => ({
    route: null,
    rider: DEFAULT_RIDER,
    targets: DEFAULT_TARGETS,
    conditions: DEFAULT_CONDITIONS,
    foodLibrary: loadFoodLibrary(),
    plan: null,
    weatherError: null,
    setRoute: (route) => {
        set({ route })
        get().recalculate()
    },
    setRider: (fields) => {
        set((state) => ({ rider: { ...state.rider, ...fields } }))
        get().recalculate()
    },
    setTargets: (fields) => {
        set((state) => ({ targets: { ...state.targets, ...fields } }))
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
