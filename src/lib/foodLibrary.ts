import type { FoodItem } from '../types'

const CUSTOM_FOODS_KEY = 'velofuel_custom_foods'

export const PRESET_FOODS: FoodItem[] = [
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
        id: 'fruechteriegel',
        name: 'Früchteriegel',
        weightG: 30,
        kcal: 95,
        carbsG: 20,
        sodiumMg: 20,
        waterMl: 0,
        isPreset: false
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
