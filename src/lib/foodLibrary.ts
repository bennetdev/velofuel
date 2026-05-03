import type { FoodItem } from '../types'

const CUSTOM_FOODS_KEY = 'velofuel_custom_foods'

export const PRESET_FOODS: FoodItem[] = [
    {
        id: 'maurten-gel-100',
        name: 'Maurten gel 100',
        weightG: 40,
        kcal: 100,
        carbsG: 25,
        sodiumMg: 55,
        waterMl: 0,
        isPreset: true
    },
    {
        id: 'banana-medium',
        name: 'Banana medium',
        weightG: 120,
        kcal: 105,
        carbsG: 27,
        sodiumMg: 1,
        waterMl: 74,
        isPreset: true
    },
    {
        id: 'medjool-date',
        name: 'Medjool date',
        weightG: 24,
        kcal: 67,
        carbsG: 18,
        sodiumMg: 0,
        waterMl: 4,
        isPreset: true
    },
    {
        id: 'rice-cake',
        name: 'Rice cake',
        weightG: 60,
        kcal: 110,
        carbsG: 22,
        sodiumMg: 120,
        waterMl: 20,
        isPreset: true
    },
    {
        id: 'clif-bar',
        name: 'Clif bar',
        weightG: 68,
        kcal: 250,
        carbsG: 45,
        sodiumMg: 200,
        waterMl: 0,
        isPreset: true
    },
    {
        id: 'tailwind-1-scoop',
        name: 'Tailwind 1 scoop',
        weightG: 29,
        kcal: 100,
        carbsG: 25,
        sodiumMg: 310,
        waterMl: 500,
        isPreset: true
    }
]

function normalizeCustomItem(item: FoodItem): FoodItem {
    return {
        ...item,
        isPreset: false,
        version: item.version ?? 1
    }
}

export function loadFoodLibrary(): FoodItem[] {
    let customItems: FoodItem[] = []
    try {
        const raw = localStorage.getItem(CUSTOM_FOODS_KEY)
        if (raw) {
            const parsed = JSON.parse(raw) as FoodItem[]
            if (Array.isArray(parsed)) {
                customItems = parsed
                    .filter((item) => item && item.isPreset === false)
                    .map((item) => normalizeCustomItem(item))
            }
        }
    } catch {
        return [...PRESET_FOODS]
    }

    return [...PRESET_FOODS, ...customItems]
}

export function saveFoodLibrary(customItems: FoodItem[]): void {
    const toPersist = customItems
        .filter((item) => item.isPreset === false)
        .map((item) => normalizeCustomItem(item))
    localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(toPersist))
}

export function createFoodItem(fields: Omit<FoodItem, 'id' | 'isPreset' | 'version'>): FoodItem {
    return {
        ...fields,
        id: crypto.randomUUID(),
        isPreset: false,
        version: 1
    }
}
