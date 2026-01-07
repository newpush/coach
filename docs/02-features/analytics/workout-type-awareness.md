# Workout Type-Aware AI Analysis

## Overview

The AI workout analysis system now intelligently adapts its analysis based on the type of workout (Cycling, Running, Gym, etc.), ensuring relevant metrics and coaching guidance for each activity type.

## Changes Made

### 1. Type Detection & Coach Persona

The system now:

- Detects workout type from the `type` field in the workout data
- Categorizes workouts as cardio (Ride, Run, Swim) or strength (Gym, WeightTraining)
- Adjusts the coach persona accordingly:
  - **Cycling Coach** for bike workouts
  - **Running Coach** for run workouts
  - **Strength & Conditioning Coach** for gym workouts
  - **Fitness Coach** for general activities

### 2. Context-Specific Guidance

Added `getWorkoutTypeGuidance()` function that provides workout-specific instructions:

- **Strength Training**: Focuses on volume, intensity, rest periods, and exercise selection. Explicitly tells AI that cadence, power output, and aerobic efficiency metrics are NOT relevant.
- **Running**: Emphasizes pace, cadence (steps per minute), and heart rate zones. Notes that power metrics may not be available.
- **Cycling**: Analyzes power metrics, pacing, cadence (RPM), and pedaling efficiency.

### 3. Adaptive Metrics Display

Metrics are now conditionally included based on relevance:

- **Power Metrics**: Only shown for cardio workouts where they're available
- **Cadence**: Unit adjusts based on activity (RPM for cycling, SPM for running)
- **Heart Rate**: Always relevant and shown for all workout types
- **Performance Indicators** (VI, decoupling, L/R balance): Only for cardio workouts

### 4. Customized Analysis Sections

Added `getAnalysisSectionsGuidance()` function that provides different analysis frameworks:

#### Strength Training Sections:

1. Training Volume
2. Intensity Management
3. Recovery & Pacing
4. Workout Execution

#### Running Sections:

1. Pacing Strategy
2. Running Form (cadence, stride efficiency)
3. Effort Management
4. Workout Execution

#### Cycling Sections (default):

1. Pacing Strategy (VI, surging)
2. Pedaling Efficiency (cadence, L/R balance)
3. Power Application
4. Workout Execution

## Implementation Details

### File Modified

- `trigger/analyze-workout.ts`

### Key Functions Added

- `getWorkoutTypeGuidance(workoutType: string, isCardio: boolean, isStrength: boolean): string`
- `getAnalysisSectionsGuidance(workoutType: string, isCardio: boolean, isStrength: boolean): string`

### Type Safety

Added `StructuredAnalysis` interface for better TypeScript support with properties for type, title, executive_summary, sections, and recommendations.

## Examples

### Gym Workout Analysis

- ✅ Analyzes: Duration, heart rate zones, perceived exertion, training volume
- ❌ Ignores: Power output, cadence, aerobic decoupling, VI (variability index)

### Running Workout Analysis

- ✅ Analyzes: Pace, cadence (spm), heart rate, effort distribution
- ❌ May not have: Power metrics (noted as optional)

### Cycling Workout Analysis

- ✅ Analyzes: Power output, cadence (rpm), FTP zones, pacing, L/R balance
- ✅ Performance indicators: VI, efficiency factor, decoupling

## Benefits

1. **Relevant Analysis**: Athletes receive feedback appropriate for their activity
2. **No Confusion**: Gym workouts won't mention meaningless cycling metrics
3. **Better Coaching**: AI provides sport-specific guidance
4. **Scalable**: Easy to add new workout types in the future

## Future Enhancements

Potential additions:

- Swim workout analysis (stroke rate, pace per 100m)
- Trail running (elevation gain focus)
- Indoor trainer vs outdoor ride differentiation
- Sport-specific power zones (running power vs cycling power)
