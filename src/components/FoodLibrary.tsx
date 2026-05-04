import { useMemo, useState, type ChangeEvent } from 'react'

import { useRideStore } from '../store/rideStore'
import type { FoodItem, RideKitItem } from '../types'

type FoodLibraryProps = {
    foodLibrary: FoodItem[]
    rideKit: RideKitItem[]
    onAddCustomFood: (fields: Omit<FoodItem, 'id' | 'isPreset' | 'version'>) => void
    onRemoveCustomFood: (foodId: string) => void
    onSetKitItem: (foodId: string, quantity: number) => void
    onRemoveKitItem: (foodId: string) => void
}

const clampQuantity = (value: number) => Math.min(20, Math.max(1, Math.round(value)))

export function FoodLibrary({
    foodLibrary,
    rideKit,
    onAddCustomFood,
    onRemoveCustomFood,
    onSetKitItem,
    onRemoveKitItem
}: FoodLibraryProps) {
    const plan = useRideStore((state) => state.plan)
    const minStopCarbsG = plan?.events?.[0]?.carbsG ?? 0
    const kitMap = useMemo(() => new Map(rideKit.map((item) => [item.foodId, item])), [rideKit])

    const [foodName, setFoodName] = useState<string>('')
    const [foodWeightG, setFoodWeightG] = useState<string>('')
    const [foodKcal, setFoodKcal] = useState<string>('')
    const [foodCarbsG, setFoodCarbsG] = useState<string>('')
    const [foodSodiumMg, setFoodSodiumMg] = useState<string>('')
    const [foodWaterMl, setFoodWaterMl] = useState<string>('')
    const [draftQuantities, setDraftQuantities] = useState<Record<string, string>>({})

    const handleAddFood = () => {
        const name = foodName.trim()
        if (!name) {
            return
        }
        const weightG = Number(foodWeightG)
        const kcal = Number(foodKcal)
        const carbsG = Number(foodCarbsG)
        const sodiumMg = Number(foodSodiumMg)
        const waterMl = Number(foodWaterMl)
        onAddCustomFood({
            name,
            weightG: isFinite(weightG) ? weightG : 0,
            kcal: isFinite(kcal) ? kcal : 0,
            carbsG: isFinite(carbsG) ? carbsG : 0,
            sodiumMg: isFinite(sodiumMg) ? sodiumMg : 0,
            waterMl: isFinite(waterMl) ? waterMl : 0
        })
        setFoodName('')
        setFoodWeightG('')
        setFoodKcal('')
        setFoodCarbsG('')
        setFoodSodiumMg('')
        setFoodWaterMl('')
    }

    const handleQuantityChange = (foodId: string, event: ChangeEvent<HTMLInputElement>) => {
        setDraftQuantities((prev) => ({ ...prev, [foodId]: event.target.value }))
    }

    const handleQuantityBlur = (foodId: string, fallbackQuantity: number) => {
        const raw = draftQuantities[foodId]
        const parsed = raw === undefined ? fallbackQuantity : Number(raw)
        const nextQuantity = clampQuantity(isFinite(parsed) ? parsed : fallbackQuantity)
        onSetKitItem(foodId, nextQuantity)
        setDraftQuantities((prev) => {
            const next = { ...prev }
            delete next[foodId]
            return next
        })
    }

    return (
        <div className="food-library">
            <div className="food-library-grid">
                {foodLibrary.map((item) => {
                    const kitItem = kitMap.get(item.id)
                    const isChecked = Boolean(kitItem)
                    const quantity = kitItem?.quantity ?? 1
                    const inputValue = draftQuantities[item.id] ?? String(quantity)
                    const lowCarb = isChecked && minStopCarbsG > 0 && item.carbsG * quantity < minStopCarbsG
                    const cardClass = `food-card${isChecked ? '' : ' is-dimmed'}${lowCarb ? ' is-warning' : ''}`

                    return (
                        <div key={item.id} className={cardClass}>
                            <div className="food-card-header">
                                <div>
                                    <p className="food-card-title">{item.name}</p>
                                    <p className="food-card-meta">
                                        {item.carbsG}g carbs · {item.sodiumMg}mg sodium · {item.weightG}g weight
                                    </p>
                                </div>
                                <div className="food-card-tags">
                                    {item.isPreset ? <span className="food-card-badge">Preset</span> : null}
                                    {!item.isPreset ? (
                                        <button
                                            type="button"
                                            className="food-card-remove"
                                            onClick={() => onRemoveCustomFood(item.id)}
                                        >
                                            Remove
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            <label className="kit-toggle">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) =>
                                        event.target.checked ? onSetKitItem(item.id, 1) : onRemoveKitItem(item.id)
                                    }
                                />
                                <span>Have this at home</span>
                            </label>

                            {isChecked ? (
                                <div className="kit-stepper">
                                    <button
                                        type="button"
                                        onClick={() => onSetKitItem(item.id, quantity - 1)}
                                        disabled={quantity <= 1}
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={inputValue}
                                        onChange={(event) => handleQuantityChange(item.id, event)}
                                        onBlur={() => handleQuantityBlur(item.id, quantity)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onSetKitItem(item.id, quantity + 1)}
                                        disabled={quantity >= 20}
                                    >
                                        +
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            <div className="food-form">
                <label className="field">
                    <span>Name</span>
                    <input value={foodName} onChange={(event) => setFoodName(event.target.value)} />
                </label>
                <label className="field">
                    <span>Weight (g)</span>
                    <input
                        type="number"
                        value={foodWeightG}
                        onChange={(event) => setFoodWeightG(event.target.value)}
                    />
                </label>
                <label className="field">
                    <span>Kcal</span>
                    <input type="number" value={foodKcal} onChange={(event) => setFoodKcal(event.target.value)} />
                </label>
                <label className="field">
                    <span>Carbs (g)</span>
                    <input
                        type="number"
                        value={foodCarbsG}
                        onChange={(event) => setFoodCarbsG(event.target.value)}
                    />
                </label>
                <label className="field">
                    <span>Sodium (mg)</span>
                    <input
                        type="number"
                        value={foodSodiumMg}
                        onChange={(event) => setFoodSodiumMg(event.target.value)}
                    />
                </label>
                <label className="field">
                    <span>Water (ml)</span>
                    <input
                        type="number"
                        value={foodWaterMl}
                        onChange={(event) => setFoodWaterMl(event.target.value)}
                    />
                </label>
                <button type="button" className="primary" onClick={handleAddFood}>
                    Add custom food
                </button>
            </div>
        </div>
    )
}
