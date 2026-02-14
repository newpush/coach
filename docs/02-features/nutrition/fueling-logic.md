# Nutrition Fueling Logic

This document describes the core metabolic engine and fueling logic used by Coach Watts to calculate carbohydrate and energy requirements.

## Fuel States

The system uses a 3-state logic to determine carbohydrate targets based on the intensity of the planned workout.

| Fuel State  | Label       | Intensity Trigger (IF) | Carb Target (g/kg) |
| :---------- | :---------- | :--------------------- | :----------------- |
| **State 1** | Eco         | IF < 0.65              | 0.0 - 1.0          |
| **State 2** | Steady      | 0.65 <= IF < 0.85      | 1.0 - 2.5          |
| **State 3** | Performance | IF >= 0.85             | 2.5 - 4.5          |

### Fueling Sensitivity

A user-configurable "Fueling Sensitivity" setting scales these targets globally (0.5 to 1.5 multiplier).

## Daily Baseline (BMR)

Basal Metabolic Rate (BMR) is calculated using the **Mifflin-St Jeor** equation:

- **Men**: (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
- **Women**: (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161

## Training Phases

Phases act as presets for macro baselines and carb scaling:

- **Base**: Focus on aerobic efficiency (Lower carb ceiling).
- **Build**: Increasing intensity (Balanced targets).
- **Race**: Peak performance (High carb availability).

## Activity Handling

- **Rest Days**: Daily baseline goals are maintained, but no PRE/INTRA/POST windows are created.
- **Multi-workout Aggregation**: Baseline is established from all sessions, with overlapping fueling windows merged logically.
