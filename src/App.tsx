import { useState, type ChangeEvent } from 'react'

import { createFoodItem } from './lib/foodLibrary'
import { parseGpx } from './lib/gpxParser'
import { calcBearing, fetchWeather } from './lib/weatherApi'
import { RouteTimeline } from './components/RouteTimeline'
import { useRideStore } from './store/rideStore'
import type { RiderProfile } from './types'

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
    applyOptimalTargets,
    setConditions,
    setFoodLibrary,
    setWeatherError
  } = useRideStore()

  const [gpxError, setGpxError] = useState<string | null>(null)
  const [gpxName, setGpxName] = useState<string | null>(null)
  const [weatherLat, setWeatherLat] = useState<string>('')
  const [weatherLon, setWeatherLon] = useState<string>('')
  const [weatherStart, setWeatherStart] = useState<string>('')
  const [foodName, setFoodName] = useState<string>('')
  const [foodWeightG, setFoodWeightG] = useState<string>('')
  const [foodKcal, setFoodKcal] = useState<string>('')
  const [foodCarbsG, setFoodCarbsG] = useState<string>('')
  const [foodSodiumMg, setFoodSodiumMg] = useState<string>('')
  const [foodWaterMl, setFoodWaterMl] = useState<string>('')

  const round0 = (value: number) => Math.round(value)
  const round1 = (value: number) => Number(value.toFixed(1))

  const formatLocalDateTime = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`
  }

  const fetchWeatherFor = async (lat: number, lon: number, startTime: Date, bearing?: number) => {
    try {
      const result = await fetchWeather(lat, lon, startTime, bearing)
      setConditions(result)
      setWeatherError(null)
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Weather fetch failed.')
    }
  }

  const handleGpxChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = parseGpx(text)
      setRoute(parsed)
      setGpxName(file.name)
      setGpxError(null)
      const firstPoint = parsed.points[0]
      if (firstPoint) {
        setWeatherLat(String(firstPoint.lat))
        setWeatherLon(String(firstPoint.lon))
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const startValue = formatLocalDateTime(tomorrow)
        setWeatherStart(startValue)
        const routeBearing =
          parsed.points.length >= 2 ? calcBearing(parsed.points[0], parsed.points[1]) : undefined
        await fetchWeatherFor(firstPoint.lat, firstPoint.lon, new Date(startValue), routeBearing)
      }
    } catch (error) {
      setGpxError(error instanceof Error ? error.message : 'Failed to parse GPX file.')
    }
  }

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
    const newItem = createFoodItem({
      name,
      weightG: isFinite(weightG) ? weightG : 0,
      kcal: isFinite(kcal) ? kcal : 0,
      carbsG: isFinite(carbsG) ? carbsG : 0,
      sodiumMg: isFinite(sodiumMg) ? sodiumMg : 0,
      waterMl: isFinite(waterMl) ? waterMl : 0
    })
    setFoodLibrary([...foodLibrary, newItem])
    setFoodName('')
    setFoodWeightG('')
    setFoodKcal('')
    setFoodCarbsG('')
    setFoodSodiumMg('')
    setFoodWaterMl('')
  }

  const handleRemoveFood = (id: string) => {
    setFoodLibrary(foodLibrary.filter((item) => item.id !== id))
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
    await fetchWeatherFor(lat, lon, startTime, routeBearing)
  }

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Fuel Lab</p>
        <h1>Plan your ride nutrition</h1>
        <p className="lede">
          Upload a GPX file, tune targets, and confirm hydration and fueling in one view.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>GPX Upload</h2>
          <span className="panel-hint">We will extract distance, elevation, and duration.</span>
        </div>
        <div className="upload-box">
          <input className="upload-input" type="file" accept=".gpx" onChange={handleGpxChange} />
          <div>
            <p className="upload-title">Drop your GPX file</p>
            <p className="upload-sub">Or click to browse.</p>
          </div>
        </div>
        {route ? (
          <div className="gpx-card">
            <div className="gpx-status">
              <span className="gpx-check">✓</span>
              <div>
                <p className="gpx-name">{gpxName ?? 'Route loaded'}</p>
                <p className="gpx-meta">
                  {round1(route.distanceKm)} km · {round0(route.elevationGainM)} m elevation ·{' '}
                  {route.durationHr ? `${round1(route.durationHr)} hr est` : 'Duration n/a'}
                </p>
              </div>
            </div>
            <span className="gpx-replace">Replace</span>
          </div>
        ) : null}
        {gpxError ? <p className="error-text">{gpxError}</p> : null}
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Rider specifications</h2>
          <div className="form-grid">
            <label className="field">
              <span>Weight (kg)</span>
              <input
                type="number"
                value={rider.weightKg}
                onChange={(event) => setRider({ weightKg: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>Height (cm)</span>
              <input
                type="number"
                value={rider.heightCm}
                onChange={(event) => setRider({ heightCm: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>Age</span>
              <input
                type="number"
                value={rider.age}
                onChange={(event) => setRider({ age: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>Sex</span>
              <select
                value={rider.sex}
                onChange={(event) => setRider({ sex: event.target.value as RiderProfile['sex'] })}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label className="field">
              <span>Water capacity (ml)</span>
              <input
                type="number"
                value={rider.waterCapacityMl}
                onChange={(event) => setRider({ waterCapacityMl: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>

        <div className="panel">
          <h2>Target intake</h2>
          <div className="slider-stack">
            <label className="field">
              <span>Carbohydrates</span>
              <div className="range-row">
                <input
                  type="range"
                  min={30}
                  max={120}
                  value={targets.carbsGPerHr}
                  onChange={(event) => setTargets({ carbsGPerHr: Number(event.target.value) })}
                />
                <span className="range-value">{targets.carbsGPerHr} g/hr</span>
              </div>
            </label>
            <label className="field">
              <span>Sodium</span>
              <div className="range-row">
                <input
                  type="range"
                  min={200}
                  max={1500}
                  value={targets.sodiumMgPerHr}
                  onChange={(event) => setTargets({ sodiumMgPerHr: Number(event.target.value) })}
                />
                <span className="range-value">{targets.sodiumMgPerHr} mg/hr</span>
              </div>
            </label>
            <label className="field">
              <span>Refuel interval</span>
              <div className="range-row">
                <input
                  type="range"
                  min={15}
                  max={60}
                  value={targets.refuelIntervalMin}
                  onChange={(event) => setTargets({ refuelIntervalMin: Number(event.target.value) })}
                />
                <span className="range-value">{targets.refuelIntervalMin} min</span>
              </div>
            </label>
          </div>
          <div className="field">
            <span>Ride intensity</span>
            <div className="toggle-group">
              <button
                type="button"
                className={targets.intensity === 'easy' ? 'toggle active' : 'toggle'}
                onClick={() => setTargets({ intensity: 'easy' })}
              >
                Easy
              </button>
              <button
                type="button"
                className={targets.intensity === 'moderate' ? 'toggle active' : 'toggle'}
                onClick={() => setTargets({ intensity: 'moderate' })}
              >
                Moderate
              </button>
              <button
                type="button"
                className={targets.intensity === 'hard' ? 'toggle active' : 'toggle'}
                onClick={() => setTargets({ intensity: 'hard' })}
              >
                Hard
              </button>
            </div>
            <button type="button" className="secondary" onClick={applyOptimalTargets}>
              Set optimal values
            </button>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Weather conditions</h2>
          <div className="form-grid">
            <label className="field">
              <span>Temperature (C)</span>
              <input
                type="number"
                value={conditions.tempC}
                onChange={(event) => setConditions({ tempC: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>Humidity (%)</span>
              <input
                type="number"
                value={conditions.humidityPct}
                onChange={(event) => setConditions({ humidityPct: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>Wind (km/h)</span>
              <input
                type="number"
                value={conditions.windKmh}
                onChange={(event) => setConditions({ windKmh: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="weather-fetch">
            <label className="field">
              <span>Lat</span>
              <input type="number" value={weatherLat} onChange={(event) => setWeatherLat(event.target.value)} />
            </label>
            <label className="field">
              <span>Lon</span>
              <input type="number" value={weatherLon} onChange={(event) => setWeatherLon(event.target.value)} />
            </label>
            <label className="field">
              <span>Start</span>
              <input
                type="datetime-local"
                value={weatherStart}
                onChange={(event) => setWeatherStart(event.target.value)}
              />
            </label>
            <button type="button" className="primary" onClick={handleFetchWeather}>
              Fetch weather data
            </button>
          </div>
          {weatherError ? <p className="error-text">{weatherError}</p> : null}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Your food library</h2>
            <span className="panel-hint">Add custom items or remove them below.</span>
          </div>
          <div className="chips">
            {foodLibrary.map((item) => (
              <div key={item.id} className="chip">
                <div>
                  <p className="chip-title">{item.name}</p>
                  <p className="chip-meta">{item.carbsG}g carbs</p>
                </div>
                {!item.isPreset ? (
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => handleRemoveFood(item.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
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
      </section>

      <section className="panel">
        <h2>Plan output</h2>
        {!route ? (
          <p className="empty">No route loaded</p>
        ) : plan ? (
          <div>
            <div className="stat-grid">
              <div className="stat">
                <p>Total energy</p>
                <h3>{round0(plan.totalKcal)} kcal</h3>
              </div>
              <div className="stat">
                <p>Total water</p>
                <h3>{round1(plan.totalWaterL)} L</h3>
              </div>
              <div className="stat">
                <p>Total carbs</p>
                <h3>{round0(plan.totalCarbsG)} g</h3>
              </div>
              <div className="stat">
                <p>Total sodium</p>
                <h3>{round0(plan.totalSodiumMg)} mg</h3>
              </div>
              <div className="stat">
                <p>Sweat rate</p>
                <h3>{round0(plan.sweatRateMlPerHr)} ml/hr</h3>
              </div>
              <div className="stat">
                <p>Ride duration</p>
                <h3>{round1(plan.estDurationHr)} hr</h3>
              </div>
            </div>
            {plan.warning ? <p className="warning">{plan.warning}</p> : null}
            {plan.refillEvents.length > 0 ? (
              <p className="warning-amber">
                This route requires {plan.refillEvents.length} bottle refill
                {plan.refillEvents.length === 1 ? '' : 's'}. Plan resupply points in advance.
              </p>
            ) : (
              <p className="warning-green">Your water capacity covers the full route.</p>
            )}
            <RouteTimeline route={route} events={plan.events} refillEvents={plan.refillEvents} />
            <div className="panel-split">
              <div>
                <h3>Refuel events</h3>
                <table>
                  <thead>
                    <tr>
                      <th>km</th>
                      <th>time</th>
                      <th>drink</th>
                      <th>carbs</th>
                      <th>sodium</th>
                      <th>note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.events.map((event, index) => (
                      <tr key={`${event.km}-${index}`}>
                        <td>{round1(event.km)}</td>
                        <td>{round0(event.timeMin)} min</td>
                        <td>{round0(event.drinkMl)} ml</td>
                        <td>{round0(event.carbsG)} g</td>
                        <td>{round0(event.sodiumMg)} mg</td>
                        <td>{event.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3>Packing list</h3>
                <ul className="packing-list">
                  {plan.packingList.map((item) => (
                    <li key={`${item.name}-${item.quantity}-${item.unit}`}>
                      <span>{item.name}</span>
                      <span>
                        {item.quantity}
                        {item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}