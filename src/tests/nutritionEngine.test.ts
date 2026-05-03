import { describe, expect, it } from 'vitest'

import {
	calcKcalPerHr,
	calcSweatRateMlPerHr,
	derivePackingList,
	generateEvents
} from '../lib/nutritionEngine'
import type { FoodItem, GpxRoute, RiderProfile, RideConditions } from '../types'

function makeFlatRoute(distanceKm: number): GpxRoute {
	return {
		points: [
			{ lat: 0, lon: 0, ele: 0 },
			{ lat: distanceKm / 111, lon: 0, ele: 0 }
		],
		distanceKm,
		elevationGainM: 0,
		durationHr: undefined
	}
}

function makeClimbRoute(): GpxRoute {
	const points = [] as GpxRoute['points']
	for (let i = 0; i < 20; i += 1) {
		const ele = i >= 10 && i <= 14 ? (i - 9) * 30 : 0
		points.push({ lat: i * 0.01, lon: 0, ele })
	}
	return {
		points,
		distanceKm: 20,
		elevationGainM: 150,
		durationHr: 1
	}
}

describe('calcKcalPerHr', () => {
	it('returns a reasonable kcal/hr for moderate effort', () => {
		const rider: RiderProfile = { weightKg: 75, heightCm: 175, age: 30, sex: 'male', waterCapacityMl: 1500 }
		const result = calcKcalPerHr(rider, 'moderate', 500, 3)
		expect(result).toBeGreaterThan(600)
		expect(result).toBeLessThan(800)
	})

	it('hard intensity produces more kcal/hr than easy', () => {
		const rider: RiderProfile = { weightKg: 75, heightCm: 175, age: 30, sex: 'male', waterCapacityMl: 1500 }
		const easy = calcKcalPerHr(rider, 'easy', 500, 3)
		const hard = calcKcalPerHr(rider, 'hard', 500, 3)
		expect(hard).toBeGreaterThan(easy)
	})
})

describe('calcSweatRateMlPerHr', () => {
	it('higher heat/humidity male is higher than cool/dry female', () => {
		const hot: RideConditions = { tempC: 30, humidityPct: 80, windKmh: 0, isHeadwind: false }
		const cool: RideConditions = { tempC: 15, humidityPct: 40, windKmh: 0, isHeadwind: false }
		const male: RiderProfile = { weightKg: 75, heightCm: 175, age: 30, sex: 'male', waterCapacityMl: 1500 }
		const female: RiderProfile = { weightKg: 75, heightCm: 175, age: 30, sex: 'female', waterCapacityMl: 1500 }
		const hotRate = calcSweatRateMlPerHr(male, hot, 'moderate')
		const coolRate = calcSweatRateMlPerHr(female, cool, 'moderate')
		expect(hotRate).toBeGreaterThan(coolRate)
	})

	it('always clamps to 300-2000 ml/hr', () => {
		const rider: RiderProfile = { weightKg: 75, heightCm: 175, age: 30, sex: 'male', waterCapacityMl: 1500 }
		const hot: RideConditions = { tempC: 50, humidityPct: 100, windKmh: 0, isHeadwind: false }
		const cold: RideConditions = { tempC: -10, humidityPct: 0, windKmh: 0, isHeadwind: true }
		const high = calcSweatRateMlPerHr(rider, hot, 'hard')
		const low = calcSweatRateMlPerHr({ ...rider, sex: 'female' }, cold, 'easy')
		expect(high).toBeLessThanOrEqual(2000)
		expect(low).toBeGreaterThanOrEqual(300)
	})
})

describe('generateEvents', () => {
	it('returns expected stop count for flat route', () => {
		const route = makeFlatRoute(100)
		const events = generateEvents(
			route,
			{ carbsGPerHr: 60, sodiumMgPerHr: 700, refuelIntervalMin: 30, intensity: 'moderate' },
			600
		)
		const durationMinutes = (route.distanceKm / 25) * 60
		const expected = Math.floor(durationMinutes / 30) - 1
		expect(events.length).toBe(expected)
	})

	it('returns empty array when points are empty', () => {
		const route: GpxRoute = { points: [], distanceKm: 0, elevationGainM: 0 }
		const events = generateEvents(
			route,
			{ carbsGPerHr: 60, sodiumMgPerHr: 700, refuelIntervalMin: 30, intensity: 'moderate' },
			600
		)
		expect(events).toEqual([])
	})

	it('flags climb-ahead events when ascent exceeds threshold', () => {
		const route = makeClimbRoute()
		const events = generateEvents(
			route,
			{ carbsGPerHr: 60, sodiumMgPerHr: 700, refuelIntervalMin: 30, intensity: 'moderate' },
			600
		)
		const hasClimbNote = events.some((event) => event.note === 'climb ahead, fuel now')
		expect(hasClimbNote).toBe(true)
	})
})

describe('derivePackingList', () => {
	it('covers total carb requirement when library is sufficient', () => {
		const events = [
			{ km: 10, timeMin: 30, drinkMl: 500, carbsG: 60, sodiumMg: 300 },
			{ km: 20, timeMin: 60, drinkMl: 500, carbsG: 60, sodiumMg: 300 }
		]
		const library: FoodItem[] = [
			{
				id: 'gel',
				name: 'Gel',
				weightG: 30,
				kcal: 100,
				carbsG: 30,
				sodiumMg: 0,
				waterMl: 0,
				isPreset: false,
				version: 1
			}
		]
		const packingList = derivePackingList(events, library)
		const totalCarbsNeeded = events.reduce((sum, event) => sum + event.carbsG, 0)
		const carbsFromItems = packingList.reduce((sum, item) => {
			if (item.name === 'Water') {
				return sum
			}
			const match = library.find((food) => food.name === item.name)
			return sum + (match ? match.carbsG * item.quantity : 0)
		}, 0)
		expect(carbsFromItems).toBeGreaterThanOrEqual(totalCarbsNeeded)
	})

	it('adds water even if the food library is empty', () => {
		const events = [{ km: 10, timeMin: 30, drinkMl: 500, carbsG: 60, sodiumMg: 300 }]
		const packingList = derivePackingList(events, [])
		expect(packingList.length).toBe(1)
		expect(packingList[0]?.name).toBe('Water')
	})
})
