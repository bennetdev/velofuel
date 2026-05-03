import { useState, type ChangeEvent } from 'react'

import { parseGpx } from './lib/gpxParser'
import { calcBearing, fetchWeather } from './lib/weatherApi'
import { useRideStore } from './store/rideStore'
import type { NutritionTargets, RiderProfile } from './types'

export default function App() {
  const {
    route,
    rider,
    targets,
    conditions,
    foodLibrary,
    plan,
    weatherError,
    setRoute,
    setRider,
    setTargets,
    setConditions,
    setWeatherError
  } = useRideStore()

  const [gpxError, setGpxError] = useState<string | null>(null)
  const [weatherLat, setWeatherLat] = useState<string>('')
  const [weatherLon, setWeatherLon] = useState<string>('')
  const [weatherStart, setWeatherStart] = useState<string>('')

  const handleGpxChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = parseGpx(text)
      setRoute(parsed)
      setGpxError(null)
    } catch (error) {
      setGpxError(error instanceof Error ? error.message : 'Failed to parse GPX file.')
    }
  }

  const handleFetchWeather = async () => {
    const lat = Number(weatherLat)
    const lon = Number(weatherLon)
    if (!isFinite(lat) || !isFinite(lon)) {
      setWeatherError('Enter valid latitude and longitude.')
      return
    }
    if (!weatherStart) {
      setWeatherError('Select a start time.')
      return
    }
    const startTime = new Date(weatherStart)
    const routeBearing =
      route && route.points.length >= 2 ? calcBearing(route.points[0], route.points[1]) : undefined
    try {
      const result = await fetchWeather(lat, lon, startTime, routeBearing)
      setConditions(result)
      setWeatherError(null)
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Weather fetch failed.')
    }
  }

  return (
    <div>
      <h1>VeloFuel</h1>

      <section>
        <h2>GPX Upload</h2>
        <input type="file" accept=".gpx" onChange={handleGpxChange} />
        {gpxError ? <p>{gpxError}</p> : null}
      </section>

      <section>
        <h2>Rider</h2>
        <label>
          Weight (kg)
          <input
            type="number"
            value={rider.weightKg}
            onChange={(event) => setRider({ weightKg: Number(event.target.value) })}
          />
        </label>
        <label>
          Height (cm)
          <input
            type="number"
            value={rider.heightCm}
            onChange={(event) => setRider({ heightCm: Number(event.target.value) })}
          />
        </label>
        <label>
          Age
          <input
            type="number"
            value={rider.age}
            onChange={(event) => setRider({ age: Number(event.target.value) })}
          />
        </label>
        <label>
          Sex
          <select value={rider.sex} onChange={(event) => setRider({ sex: event.target.value as RiderProfile['sex'] })}>
            <option value="male">male</option>
            <option value="female">female</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Targets</h2>
        <label>
          Carbs (g/hr): {targets.carbsGPerHr}
          <input
            type="range"
            min={30}
            max={120}
            value={targets.carbsGPerHr}
            onChange={(event) => setTargets({ carbsGPerHr: Number(event.target.value) })}
          />
        </label>
        <label>
          Sodium (mg/hr): {targets.sodiumMgPerHr}
          <input
            type="range"
            min={200}
            max={1500}
            value={targets.sodiumMgPerHr}
            onChange={(event) => setTargets({ sodiumMgPerHr: Number(event.target.value) })}
          />
        </label>
        <label>
          Refuel interval (min): {targets.refuelIntervalMin}
          <input
            type="range"
            min={15}
            max={60}
            value={targets.refuelIntervalMin}
            onChange={(event) => setTargets({ refuelIntervalMin: Number(event.target.value) })}
          />
        </label>
        <label>
          Intensity
          <select
            value={targets.intensity}
            onChange={(event) => setTargets({ intensity: event.target.value as NutritionTargets['intensity'] })}
          >
            <option value="easy">easy</option>
            <option value="moderate">moderate</option>
            <option value="hard">hard</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Conditions</h2>
        <label>
          Temperature (C)
          <input
            type="number"
            value={conditions.tempC}
            onChange={(event) => setConditions({ tempC: Number(event.target.value) })}
          />
        </label>
        <label>
          Humidity (%)
          <input
            type="number"
            value={conditions.humidityPct}
            onChange={(event) => setConditions({ humidityPct: Number(event.target.value) })}
          />
        </label>
        <label>
          Wind (km/h)
          <input
            type="number"
            value={conditions.windKmh}
            onChange={(event) => setConditions({ windKmh: Number(event.target.value) })}
          />
        </label>
        <label>
          Headwind
          <input
            type="checkbox"
            checked={conditions.isHeadwind}
            onChange={(event) => setConditions({ isHeadwind: event.target.checked })}
          />
        </label>
      </section>

      <section>
        <h2>Weather Fetch</h2>
        <label>
          Latitude
          <input type="number" value={weatherLat} onChange={(event) => setWeatherLat(event.target.value)} />
        </label>
        <label>
          Longitude
          <input type="number" value={weatherLon} onChange={(event) => setWeatherLon(event.target.value)} />
        </label>
        <label>
          Start time
          <input
            type="datetime-local"
            value={weatherStart}
            onChange={(event) => setWeatherStart(event.target.value)}
          />
        </label>
        <button type="button" onClick={handleFetchWeather}>
          Fetch weather
        </button>
        {weatherError ? <p>{weatherError}</p> : null}
      </section>

      <section>
        <h2>Food Library</h2>
        <ul>
          {foodLibrary.map((item) => (
            <li key={item.id}>
              {item.name} - {item.carbsG}g carbs
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Plan</h2>
        {!route ? (
          <p>No route loaded</p>
        ) : plan ? (
          <div>
            <p>Total kcal: {plan.totalKcal}</p>
            <p>Total water (L): {plan.totalWaterL}</p>
            <p>Total carbs (g): {plan.totalCarbsG}</p>
            <p>Total sodium (mg): {plan.totalSodiumMg}</p>
            <p>Sweat rate (ml/hr): {plan.sweatRateMlPerHr}</p>
            <p>Estimated duration (hr): {plan.estDurationHr}</p>
            {plan.warning ? <p>{plan.warning}</p> : null}
            <table>
              <thead>
                <tr>
                  <th>km</th>
                  <th>timeMin</th>
                  <th>drinkMl</th>
                  <th>carbsG</th>
                  <th>sodiumMg</th>
                  <th>note</th>
                </tr>
              </thead>
              <tbody>
                {plan.events.map((event, index) => (
                  <tr key={`${event.km}-${index}`}>
                    <td>{event.km}</td>
                    <td>{event.timeMin}</td>
                    <td>{event.drinkMl}</td>
                    <td>{event.carbsG}</td>
                    <td>{event.sodiumMg}</td>
                    <td>{event.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              {plan.packingList.map((item) => (
                <li key={`${item.name}-${item.quantity}-${item.unit}`}>
                  {item.quantity}
                  {item.unit} {item.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}