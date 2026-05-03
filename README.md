# VeloFuel
*Mostly vide coded project

**Plan your ride nutrition.** VeloFuel is a browser-based cycling nutrition dashboard that turns a GPX file, real-time weather data, and your on-bike food into a personalised refuelling timeline — telling you exactly when to eat, when to drink, and what to pack.

**[Live demo](https://velofuel-dashboard.vercel.app/)** · Built with React, TypeScript, and Vite.

![VeloFuel dashboard screenshot](/src/assets/demo1.png)
![VeloFuel dashboard screenshot2](/src/assets/demo2.png)

---

## Features

- GPX file upload — parses recorded rides (Garmin/Wahoo) and planned routes (Komoot/RideWithGPS)
- Live weather fetch via [Open-Meteo](https://open-meteo.com) — no API key required
- Interactive nutrition targets — sliders update the plan instantly
- Elevation-aware refuelling — climbs trigger early fuelling reminders
- Water capacity tracking — refill waypoints inserted when bottles run dry
- Custom food library with localStorage persistence
- Optimal target presets based on ride intensity

---

## Getting started

```bash
git clone https://github.com/yourname/velofuel.git
cd velofuel
npm install
npm run dev
```

Run tests:

```bash
npm test
```

---

## How it works

VeloFuel is a pure client-side application. All calculations run in the browser — no backend, no accounts, no data leaves your device except for the Open-Meteo weather request.

The pipeline is:

```
GPX file → route parser → nutrition engine → refuel timeline
                ↑
         weather fetch
                ↑
         rider profile + targets
```

---

## Calculation algorithms

### 1. Haversine distance

To compute the distance between consecutive GPS points, VeloFuel uses the Haversine formula, which gives the great-circle distance between two points on a sphere given their latitudes and longitudes.

For two points $a$ and $b$ with latitudes $\phi_1$, $\phi_2$ and longitudes $\lambda_1$, $\lambda_2$:

$$h = \sin^2\!\left(\frac{\phi_2 - \phi_1}{2}\right) + \cos\phi_1 \cdot \cos\phi_2 \cdot \sin^2\!\left(\frac{\lambda_2 - \lambda_1}{2}\right)$$

$$d = 2R \cdot \arcsin\!\left(\min\!\left(1,\, \sqrt{h}\right)\right)$$

Where $R = 6371\,\text{km}$ is the mean Earth radius. The `min(1, ...)` guard prevents floating-point errors from producing values slightly above 1 for identical points.

Total route distance is the sum of all consecutive point distances:

$$D = \sum_{i=1}^{n-1} d(p_i,\, p_{i+1})$$

---

### 2. Elevation gain

Raw GPS elevation data contains noise — small fluctuations of 1–2 metres that would accumulate into a meaningless total if summed blindly. VeloFuel filters these out with a minimum step threshold:

$$\Delta e_i = e_{i+1} - e_i$$

$$G = \sum_{i=1}^{n-1} \max(0,\, \Delta e_i) \cdot \mathbf{1}[\Delta e_i > 2\,\text{m}]$$

Only upward steps greater than 2 metres are counted. This closely matches the elevation gain figures reported by Strava and Garmin Connect for the same GPX files.

---

### 3. Ride duration estimate

If the GPX file contains `<time>` elements (recorded rides), duration is derived from the timestamp difference between the first and last point:

$$T = \frac{t_{\text{last}} - t_{\text{first}}}{3600}\,\text{hr}$$

If no timestamps are present (planned routes), duration is estimated from distance and a speed lookup by intensity:

| Intensity | Assumed speed |
|-----------|--------------|
| Easy      | 20 km/h      |
| Moderate  | 25 km/h      |
| Hard      | 30 km/h      |

$$T = \frac{D}{v_{\text{intensity}}}$$

---

### 4. Calorie burn

Energy expenditure is modelled using Metabolic Equivalent of Task (MET) values, adjusted for rider weight, an activity factor, and elevation gain.

**Base burn:**

$$\dot{E}_{\text{base}} = \text{MET} \times m \times 1.05$$

Where $m$ is rider weight in kg and $1.05$ is an empirical activity correction. MET values used:

| Intensity | MET  |
|-----------|------|
| Easy      | 6.0  |
| Moderate  | 8.5  |
| Hard      | 11.5 |

**Elevation correction:**

Climbing requires additional energy beyond what MET captures. VeloFuel adds 10 kcal per 100 metres of ascent per hour:

$$\dot{E}_{\text{climb}} = \frac{G / T}{100} \times 10$$

Where $G / T$ is the average ascent rate in metres per hour.

**Total calorie burn rate:**

$$\dot{E} = \dot{E}_{\text{base}} + \dot{E}_{\text{climb}} \quad [\text{kcal/hr}]$$

**Total calories for the ride:**

$$E_{\text{total}} = \dot{E} \times T$$

---

### 5. Sweat rate

Hydration needs are driven by sweat rate, which varies significantly with temperature, humidity, sex, and headwind. VeloFuel models sweat rate as:

$$\dot{S} = 500 \times k_{\text{intensity}} + 35 \times \max(0,\, T_{\text{air}} - 15)$$

Where the baseline 500 ml/hr is adjusted upward by 35 ml/hr for each degree Celsius above 15°C.

**Intensity multiplier** $k_{\text{intensity}}$:

| Intensity | $k$ |
|-----------|-----|
| Easy      | 0.8 |
| Moderate  | 1.0 |
| Hard      | 1.25 |

**Humidity modifier:** if relative humidity exceeds 70%, evaporative cooling is reduced and sweat rate increases:

$$\dot{S} \mathrel{*}= 1.15$$

**Sex modifier:** males typically have a higher sweat rate:

$$\dot{S} \mathrel{*}= 1.1 \quad \text{if male}$$

**Headwind modifier:** airflow over the skin increases evaporative cooling, reducing effective sweat loss:

$$\dot{S} \mathrel{*}= 0.92 \quad \text{if headwind}$$

**Clamped to physiologically plausible range:**

$$\dot{S} = \text{clamp}(\dot{S},\, 300,\, 2000) \quad [\text{ml/hr}]$$

**Total water needed:**

$$W_{\text{total}} = \dot{S} \times T \quad [\text{ml}]$$

---

### 6. Carbohydrate targets

Carbohydrate intake targets are set by the user (30–120 g/hr) and applied uniformly across all refuel intervals. The physiological basis for the defaults:

| Intensity | Recommended carbs |
|-----------|------------------|
| Easy      | 40 g/hr          |
| Moderate  | 60 g/hr          |
| Hard      | 90 g/hr          |

> **Note:** above 90 g/hr, a dual-source carbohydrate mix (glucose + fructose) is required. The human gut can absorb approximately 60 g/hr of glucose and 30 g/hr of fructose through separate transporter pathways, giving a combined maximum of ~90 g/hr. Single-source carbs (glucose only) are capped at ~60 g/hr regardless of intake.

---

### 7. Sodium targets

Sodium is lost in sweat at approximately 500–1000 mg/hr depending on sweat rate and individual variation. VeloFuel allows the user to set a target (200–1500 mg/hr). Defaults by intensity:

| Intensity | Recommended sodium |
|-----------|-------------------|
| Easy      | 400 mg/hr         |
| Moderate  | 700 mg/hr         |
| Hard      | 1000 mg/hr        |

---

### 8. Refuel event generation

Refuel events are generated at fixed time intervals (set by the user, 15–60 min) and converted to km positions using average speed:

$$\text{km}_i = v_{\text{avg}} \times \frac{t_i}{60}$$

Where $v_{\text{avg}} = D / T$ and $t_i = i \times \Delta t_{\text{interval}}$.

**Per-event quantities:**

$$\Delta t_{\text{hr}} = \frac{\Delta t_{\text{interval}}}{60}$$

$$\text{drink}_i = \dot{S} \times \Delta t_{\text{hr}} \quad [\text{ml}]$$

$$\text{carbs}_i = \dot{C} \times \Delta t_{\text{hr}} \quad [\text{g}]$$

$$\text{sodium}_i = \dot{\text{Na}} \times \Delta t_{\text{hr}} \quad [\text{mg}]$$

---

### 9. Climb lookahead

At each refuel position, VeloFuel looks 5 km ahead and sums the elevation gain in that window. If the upcoming gain exceeds 80 metres, the refuel event is moved 3 km earlier to ensure the rider fuels before the climb rather than during it:

$$G_{\text{ahead}} = \sum_{p \in [k_i,\, k_i + 5\,\text{km}]} \max(0,\, \Delta e_p)$$

$$\text{if } G_{\text{ahead}} > 80\,\text{m}: \quad k_i \mathrel{-}= 3\,\text{km}$$

This is a simplified heuristic. A more precise model would adjust carb quantity rather than position, but the early-fuelling approach is consistent with common sports nutrition advice.

---

### 10. Bottle refill events

VeloFuel tracks cumulative water consumption across refuel events and inserts a refill marker when remaining water drops below a 200 ml safety buffer:

$$W_{\text{remaining}} \mathrel{-}= \text{drink}_i \quad \text{at each stop}$$

$$\text{if } W_{\text{remaining}} < 200\,\text{ml}: \quad \text{insert refill at } k_i, \quad W_{\text{remaining}} \leftarrow W_{\text{capacity}}$$

If total water needed is less than carry capacity for the full ride, no refill events are generated.

---

### 11. Route bearing and headwind detection

The initial bearing of the route is computed from the first two GPX points using the forward azimuth formula:

$$\theta = \arctan2\!\left(\sin(\Delta\lambda)\cos\phi_2,\; \cos\phi_1\sin\phi_2 - \sin\phi_1\cos\phi_2\cos(\Delta\lambda)\right)$$

Converted to degrees $[0°, 360°)$.

Wind direction from Open-Meteo is the direction wind is **coming from**. Headwind is detected when the angular difference between the reversed route bearing and wind direction is within 45°:

$$\delta = \left|(\theta + 180°\bmod 360°) - \theta_{\text{wind}}\right| \bmod 360°$$

$$\text{isHeadwind} = \min(\delta,\, 360° - \delta) \leq 45°$$

---

### 12. Packing list

The packing list is derived by a greedy algorithm that satisfies total carbohydrate requirements using the highest carb-density food items first:

$$\rho_i = \frac{C_i}{m_i} \quad [\text{g carbs per g food}]$$

Items are sorted descending by $\rho_i$. For each item, the quantity required to cover remaining carb demand is:

$$n_i = \left\lfloor \frac{C_{\text{remaining}}}{C_i} \right\rfloor$$

If $n_i = 0$ but $C_{\text{remaining}} > 0$, one unit is taken. This continues until the carb target is met or the food library is exhausted. A warning is surfaced if the library cannot cover the full target.

> Sodium is tracked separately through targets and is not included in the greedy allocation — the packing list is weight-optimised for carbs only.

---

## Weather data

Weather is fetched from [Open-Meteo](https://open-meteo.com) — a free, open-source weather API requiring no API key. The forecast endpoint is queried for hourly `temperature_2m`, `relativehumidity_2m`, `windspeed_10m`, and `winddirection_10m`. The hourly index closest to the planned ride start time is selected.

When a GPX file is loaded, the start coordinates are extracted automatically from the first track point — no manual lat/lon entry required.

---

## GPX support

VeloFuel parses GPX files using the native browser `DOMParser` — no external XML library. Both GPX formats are supported:

- `<trk>/<trkseg>/<trkpt>` — recorded rides (Garmin, Wahoo, Hammerhead)
- `<rte>/<rtept>` — planned routes (Komoot, RideWithGPS, Sigma Data Center)

Multiple `<trkseg>` segments are concatenated, handling signal-loss gaps in recorded rides.

---

## Project structure

```
src/
├── lib/
│   ├── nutritionEngine.ts   # All calculation logic
│   ├── gpxParser.ts         # GPX XML parsing
│   ├── gpxExporter.ts       # GPX export with waypoints
│   ├── weatherApi.ts        # Open-Meteo integration
│   └── foodLibrary.ts       # Preset foods + localStorage persistence
├── store/
│   └── rideStore.ts         # Zustand global state
├── types/
│   └── index.ts             # All TypeScript types
└── components/
    └── RouteTimeline.tsx    # Elevation chart + refuel timeline
```

---

## Tech stack

| Tool | Purpose |
|------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| Zustand | State management |
| Recharts | Elevation profile chart |
| Open-Meteo | Weather API (free, no key) |
| Vitest | Unit testing |

---

## References

- Jeukendrup, A. (2011). *Nutrition for endurance sports: marathon, triathlon, and road cycling.* Journal of Sports Sciences.
- Burke, L.M. et al. (2011). *Carbohydrates for training and competition.* Journal of Sports Sciences.
- Sawka, M.N. et al. (2007). *American College of Sports Medicine position stand: exercise and fluid replacement.* Medicine & Science in Sports & Exercise.
- MET values from: Ainsworth et al. (2011). *2011 Compendium of Physical Activities.* Medicine & Science in Sports & Exercise.
