# Nutrition System

## Overview

Coach Wattz features a professional-grade, **Dynamic Periodized Fueling** system. Unlike standard calorie trackers, it calculates nutritional targets based on the **Energy Demand** and **Intensity** of planned and completed training.

The core logic is anchored in "Fuel for the Work Required" and "Train High, Sleep Low" periodization models, allowing athletes to optimize their metabolic flexibility and performance.

The system utilizes a **Unified Metabolic Engine** on the server, which computes fueling plans and energy simulations in real-time, ensuring deterministic results across all interfaces (Web UI, Mobile, and Chat).

## Metabolic Baselines

The foundation of the nutrition system is the user's metabolic profile:

- **BMR (Basal Metabolic Rate)**: Automatically calculated using the **Mifflin-St Jeor** formula based on age, height, weight, and sex.
- **NEAT (Daily Activity Level)**: A Physical Activity Level (PAL) multiplier applied to BMR to estimate **Total Daily Energy Expenditure (TDEE)**.
- **Target Calories**: The final daily calorie goal, adjusted based on the user's **Goal Profile** (Lose, Maintain, Gain) and custom **Aggressiveness** percentages.

## Core Concepts

### 1. Fuel States

The system categorizes physiological demand into three "Fuel States" based on Intensity Factor (IF):

| Fuel State               | Description       | Typical Intensity | Carbohydrate Focus                           |
| :----------------------- | :---------------- | :---------------- | :------------------------------------------- |
| **State 1: Eco**         | Recovery / Easy   | IF < 0.60         | Fat oxidation focus, low glycogen demand.    |
| **State 2: Steady**      | Endurance / Tempo | IF 0.60 - 0.85    | Balanced fueling, moderate glycogen demand.  |
| **State 3: Performance** | Threshold / Race  | IF > 0.85         | High glycolytic demand, prioritized fueling. |

Users can **calibrate** these triggers and the associated g/kg carbohydrate ranges in their Professional settings.

### 2. Glycemic Response Modeling (Performance Simulation)

Coach Wattz moves beyond simple calorie counting by treating every food item as a **Rate of Appearance (Ra)** curve. This simulates how quickly energy actually becomes available in the "Fuel Tank."

#### Absorption Profiles

Food items are categorized into five distinct profiles, each using a **Gamma distribution** model to calculate its specific glycemic response:

| Fuel Type                      | Time to Start | Peak Energy | Duration | Best For...                   |
| :----------------------------- | :------------ | :---------- | :------- | :---------------------------- |
| **Rapid (Liquid/Gel)**         | 5 min         | 15–20 min   | 45 min   | Intra-Workout State 3         |
| **Fast (Fruit/White Bread)**   | 10 min        | 30–45 min   | 90 min   | Immediate Pre-Workout         |
| **Balanced (Oats/Pasta)**      | 30 min        | 60–90 min   | 3 hours  | Pre-Workout Meals             |
| **Dense (Protein/Fats/Fiber)** | 45 min        | 120+ min    | 5+ hours | Daily Base / Recovery         |
| **Hyper-Load (Large Meal)**    | 60 min        | 180 min     | 8 hours  | Night before State 3 / Racing |

#### Physiological Absorption Cap

Even with high carbohydrate intake, the human body has a finite processing rate. The system enforces a **physiological oxidation limit of 90g/hr** (22.5g per 15-minute interval). Overeating results in a capped "refill plateau," accurately reflecting metabolic bottlenecks.

### 3. Unified Real-Time Engine

All nutrition and metabolic calculations are performed on-demand via the server's **Nutrition Domain Module**. This eliminates drift between background jobs and UI displays.

- **Real-Time Computation**: Fueling plans and energy timelines are re-calculated instantly when workouts are added, modified, or completed.
- **Deterministic Continuity**: The "Fuel Chain" (carryover glycogen and fluid debt) is calculated recursively through the server-side logic, ensuring a smooth transition between historical data and future projections.
- **Side-Effect Free Reads**: Fetching nutrition data does not trigger background jobs or DB writes by default, ensuring fast and safe API responses.

### 4. Metabolic Ghost (Future Projection)

To help athletes "see the future" of their recovery, the Operational Dashboard includes a **Metabolic Ghost** line.

- **Function**: A faint, dashed purple line on the Live Energy Availability chart.
- **Trigger**: Visible whenever the AI Coach provides a specific meal recommendation.
- **Simulation**: The server runs a dedicated simulation (`/api/nutrition/simulate-impact`) to project the exact metabolic impact of the recommended meal.

### 5. Fueling Sensitivity

A global multiplier (80% to 120%) that scales all carbohydrate targets.

- **Low Sensitivity (80-95%)**: Suited for "Fat Adapted" athletes or those in a base/weight-loss phase.
- **High Sensitivity (105-120%)**: Suited for "Sugar Burners" or athletes in high-volume, high-intensity build blocks.

### 6. Season Blocks (Training Phases)

Athletes can apply metabolic presets based on their current season focus:

- **Base Phase**: Higher protein/fat, lower carb scaling to enhance recovery and metabolic efficiency.
- **Build Phase**: Balanced macro distribution with moderate carb scaling for performance.
- **Taper / Race Week**: Prioritized carbohydrate loading and optimized fueling for peak output.

## Dietary Constraints ("Non-Negotiables")

To ensure AI-generated advice is safe and individualized, the system tracks four distinct layers of dietary needs:

1.  **Dietary Profile**: General patterns like Vegan, Keto, or Paleo.
2.  **Food Allergies**: Strict avoidance of immune-triggering foods (e.g., Peanuts, Shellfish).
3.  **Food Intolerances**: Avoidance of foods causing digestive or metabolic distress (e.g., Lactose, Fructose).
4.  **Lifestyle Exclusions**: Strict avoidance of specific ingredients for health/performance (e.g., Seed Oils, Refined Sugar, Alcohol).

## Advanced Protocols

### Train Low

The system supports "Train Low" (low glycogen availability) protocols to boost mitochondrial biogenesis. When a workout is flagged as `TRAIN_LOW`:

- **Pre-Workout**: Carbs are minimized (<10g).
- **Intra-Workout**: Carbs are zeroed out (Water + Electrolytes only).
- **Post-Workout**: Protein targets are increased to support muscle repair while glycogen replenishment is strategically managed.

## Hydration Precision

Calculates fluid and electrolyte replacement needs based on:

- **Sweat Rate (L/hr)**: Fluid loss per hour of exercise.
- **Sodium Concentration (mg/L)**: Sodium lost per liter of sweat.
- **Timing Windows**: Configurable lead times for pre-workout hydration and post-workout recovery windows.

## Bio-Optimization Stack

Tracks usage of performance-enhancing supplements to provide AI-powered timing and dosage advice based on workout intensity:

- **Caffeine**: Focus and fatigue reduction.
- **Nitrates**: Blood flow and oxygen delivery.
- **Beta-Alanine**: Acid buffering.
- **Sodium Bicarbonate**: Intracellular buffering.
- **Glycerol**: Hyperhydration.
- **Creatine, Collagen, Tart Cherry**: Recovery and structural integrity.

## UI Implementation & Visualization

The nutrition system is integrated across five primary views to provide a seamless "Plan-Execute-Debrief" loop:

### 1. Strategic Calendar (Overview)

- **Fuel State Dots**: Colored indicators (Blue/Eco, Orange/Steady, Red/Performance) on each day show the weekly "Carb Wave."
- **Metabolic Horizon**: A continuous energy wave spanning the week, synchronized with the server's range-based wave generator.

### 2. Operational Dashboard (Execution)

- **Nutrition Fueling Card**: A full-width dedicated section providing a real-time summary of the current day.
- **Glycogen "Fuel Tank"**: Visual progress bar showing projected energy levels and metabolic state.
- **Live Energy Availability Chart**: An interactive visualization showing projected fuel levels throughout the day.
  - **Single Source of Truth**: All points are pre-computed on the server to ensure consistency with the "Fuel Tank."
  - **Toggles**: Switch between **%** (Fuel Tank), **kcal** (Energy Balance), and **carbs** (Net Carb Balance).
  - **Metabolic Ghost**: A faint purple dashed line showing the projected impact of current AI meal advice.
- **AI Nutrition Advice**: A dedicated card that appears when the AI identifies a fueling gap.

### 3. Planned Workout "Prep Room" (Preparation)

- **Nutrition & Fueling Prep**: Specific section inside planned workouts with step-by-step fueling scripts.
- **Hydration Targets**: Clear fluid (L) and sodium (mg) requirements based on projected intensity and duration.

### 4. Nutrition Journal (The "Specific Day")

- **Fueling Timeline**: Food entries are automatically grouped into their respective fueling windows (Pre/Intra/Post/Daily Base) based on the server-calculated plan.
- **Live Sync**: Journal updates immediately reflect in the "Fuel Tank" and "Energy Chart" via real-time server re-simulation.

### 5. Workout Debrief (Metabolic Analysis)

- **Metabolic Delta**: Comparison of actual kJ burned vs. planned work.
- **Recovery Correction**: Automatic alerts if over-performance requires extra recovery fuel.
