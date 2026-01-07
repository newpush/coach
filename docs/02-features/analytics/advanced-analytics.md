# Advanced Analytics Specification

## 1. W' Balance (Anaerobic Work Capacity)

The W' Balance model tracks the depletion and replenishment of the athlete's anaerobic battery.

### Input Parameters

- `powerStream`: Array of power values in Watts.
- `timeStream`: Array of timestamps in seconds.
- `ftp`: Functional Threshold Power in Watts.
- `wPrime`: Total Anaerobic Work Capacity in Joules (Default: 20,000J).

### Calculation Logic

- **Depletion:** When `Power > FTP`, $W'_{bal} = W'_{bal} - (Power - FTP) \cdot \Delta t$
- **Recovery:** When `Power < FTP`, $W'_{bal}$ recovers according to the Skiba or integral model:
  - $W'_{bal} = W' - (W' - W'_{bal\_prev}) \cdot e^{-\Delta t / \tau}$
  - Where $\tau = 546 \cdot e^{-0.01 \cdot (FTP - Power)} + 316$ (Skiba 2012).

### Output

- `wPrimeBalance`: Array of Joules remaining at each second.

---

## 2. Efficiency Factor (EF) Decay

Measures the degradation of aerobic efficiency over time (aerobic decoupling visualized).

### Input Parameters

- `powerStream`: Array of power values.
- `hrStream`: Array of heart rate values.
- `windowSize`: Rolling average window in seconds (Default: 300s).

### Calculation Logic

1. Calculate `EF = Power / HR` for each second.
2. Apply a rolling average of 5 minutes (300s) to smooth the data.
3. Compare the average EF of the first half vs. the second half to calculate total decay percentage.

### Output

- `efStream`: Array of smoothed EF values.
- `totalDecay`: Percentage difference between first and last 20% of the workout.

---

## 3. Cadence/Power Profiling (Quadrants)

Analyzes the relationship between force (power) and velocity (cadence).

### Input Parameters

- `powerStream`: Array of power values.
- `cadenceStream`: Array of cadence values.
- `ftp`: User's FTP.
- `targetCadence`: Ideal cadence (Default: 90 rpm).

### Logic

Categorize each data point:

- **Q1 (High Power, High Cadence):** Power > FTP \* 0.8 && Cadence > 90
- **Q2 (High Power, Low Cadence):** Power > FTP \* 0.8 && Cadence <= 90
- **Q3 (Low Power, Low Cadence):** Power <= FTP \* 0.8 && Cadence <= 90
- **Q4 (Low Power, High Cadence):** Power <= FTP \* 0.8 && Cadence > 90

### Output

- `quadrantDistribution`: Object containing percentages for each quadrant.
- `quadrantSeconds`: Total seconds spent in each quadrant.
