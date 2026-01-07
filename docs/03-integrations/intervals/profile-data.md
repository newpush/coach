# Intervals.icu Athlete Profile Data

This document describes the athlete profile data available from Intervals.icu API and how to collect it.

## Test Script

Created: `scripts/test-intervals-profile.js`

Usage:

```bash
node scripts/test-intervals-profile.js
```

## Available Profile Data

### 1. Basic Athlete Information

**Endpoint:** `GET /api/v1/athlete/{athleteId}`

**Key Fields:**

- `name` - Athlete's display name
- `email` - Email address
- `sex` - Gender (M/F)
- `icu_date_of_birth` - Date of birth (can calculate age)
- `city`, `state`, `country` - Location
- `timezone` - Athlete's timezone
- `locale` - Language preference
- `measurement_preference` - Units (meters/imperial)

### 2. Physical Metrics

**From Athlete Endpoint:**

- `icu_weight` - Current weight (kg)
- `icu_resting_hr` - Resting heart rate (bpm)

### 3. Performance Metrics

**From `icu_type_settings` array (per activity type):**

- `ftp` - Functional Threshold Power (watts) for cycling
- `lthr` - Lactate Threshold Heart Rate (bpm)
- `max_hr` - Maximum heart rate (bpm)
- `threshold_pace` - Threshold pace for running/swimming

**Note:** These are configured per activity type (Ride, Run, Swim, etc.)

### 4. Recent Wellness Data

**Endpoint:** `GET /api/v1/athlete/{athleteId}/wellness/{date}`

**Key Fields:**

- `hrv` - Heart Rate Variability (ms)
- `hrvSDNN` - HRV SDNN metric
- `restingHR` - Daily resting heart rate
- `weight` - Daily weight measurement
- `sleepSecs` - Sleep duration in seconds
- `readiness` - Readiness score
- `soreness`, `fatigue`, `stress`, `mood`, `motivation` - Subjective metrics

## Example Profile Data Structure

```json
{
  "name": "hdkiller",
  "email": "hdkiller@gmail.com",
  "sex": "M",
  "dateOfBirth": "1985-02-09",
  "age": 40,
  "location": {
    "city": "Gödöllő",
    "state": "Pest",
    "country": "Hungary"
  },
  "weight": 99,
  "restingHR": 58,
  "ftp": null,
  "lthr": null,
  "maxHR": null,
  "recentHRV": 74.91057,
  "avgRecentHRV": 81.2,
  "recentWeight": 99,
  "timezone": "Europe/Budapest",
  "locale": "en",
  "measurementPreference": "meters"
}
```

## Implementation Notes

### FTP Detection Strategy

Since FTP is stored per activity type in `icu_type_settings`:

1. First look for cycling types (Ride, VirtualRide)
2. Fall back to first activity type with FTP configured
3. If no FTP found, display as "Not configured"

### HRV Strategy

- Fetch last 7 days of wellness data
- Display most recent HRV value
- Calculate 7-day average for trend
- Handle missing data gracefully (some days may not have HRV)

### Weight Data

- Use `icu_weight` as primary source (athlete profile level)
- Fall back to most recent wellness data entry with weight
- Track from wellness data for historical trends

## Dashboard Display Recommendations

### Athlete Profile Card

Display on `/dashboard` when Intervals.icu is connected:

```
┌─────────────────────────────────────┐
│ 👤 Athlete Profile                    │
├─────────────────────────────────────┤
│ Name: hdkiller                      │
│ Age: 40 • Sex: M • Weight: 99 kg   │
│ Location: Gödöllő, Hungary          │
│                                     │
│ Performance Metrics:                │
│ • FTP: 250W (cycling)              │
│ • Max HR: 185 bpm                  │
│ • Resting HR: 58 bpm               │
│                                     │
│ Recent Recovery:                    │
│ • HRV Today: 75 ms                 │
│ • HRV 7-day avg: 81 ms             │
│ • Readiness: 41%                   │
└─────────────────────────────────────┘
```

## API Integration Steps

1. **Create API Endpoint**: `server/api/profile/index.get.ts`
   - Fetch athlete data from Intervals.icu
   - Fetch recent wellness data (last 7 days)
   - Combine and format data
   - Cache for performance

2. **Update Intervals Utils**: `server/utils/intervals.ts`
   - Add `fetchIntervalsAthleteProfile()` function
   - Add profile normalization function
   - Handle missing/null values

3. **Add Database Model** (optional):
   - Store profile snapshots for offline access
   - Track profile changes over time

4. **Dashboard Component**: Update `/dashboard`
   - Add AthleteProfile component
   - Fetch profile data on mount
   - Handle loading/error states
   - Refresh on data sync

## Authentication

Uses same Basic Auth as other Intervals.icu endpoints:

```javascript
const auth = Buffer.from(`API_KEY:${apiKey}`).toString('base64')
headers: { 'Authorization': `Basic ${auth}` }
```

## Rate Limiting Considerations

- Profile data changes infrequently
- Can cache for 1 hour
- Wellness data can be fetched once per day
- Batch wellness requests with delay to avoid rate limits
