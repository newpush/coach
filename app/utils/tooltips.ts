export const metricTooltips: Record<string, string> = {
  // Key Stats
  'Training Load': 'A measure of the total physiological stress of the workout.',
  'Avg HR': 'Average Heart Rate: The mean number of heartbeats per minute.',
  'Avg Power': 'Average Power: The mean power output in Watts.',
  'Norm Power':
    'Normalized Power (NP): An estimate of the power you could have maintained for the same physiological cost if your effort had been perfectly constant. It accounts for the extra physiological cost of high-intensity surges.',

  // Training Impact
  'TSS (Load)':
    'Training Stress Score: A score based on duration and intensity relative to your FTP. 100 TSS is roughly 1 hour at max sustainable effort.',
  'Fitness (CTL)':
    'Chronic Training Load: Your long-term fitness, representing a weighted average of your daily training load over the last 42 days.',
  'Fatigue (ATL)':
    'Acute Training Load: Your recent fatigue, representing a weighted average of your daily training load over the last 7 days.',
  'Form (TSB)':
    'Training Stress Balance: Fitness (CTL) minus Fatigue (ATL). Positive values indicate freshness; negative values indicate accumulated fatigue.',

  // Efficiency & Advanced
  'Variability Index':
    'VI: The ratio of Normalized Power to Average Power. A VI of 1.0 means steady pacing (like a time trial); higher values (e.g., 1.2+) indicate "spiky" or variable effort.',
  'Efficiency Factor':
    'EF: Normalized Power divided by Average Heart Rate. Measures your aerobic efficiency (power produced per heartbeat). Higher is generally better.',
  'Aerobic Decoupling':
    'Aerobic Decoupling (Pw:HR): Measures how much your heart rate drifts upward relative to power over the session. Less than 5% usually indicates good endurance.',
  'Power/HR Ratio':
    'The ratio of power output to heart rate. Similar to Efficiency Factor but often calculated on raw averages.',
  'Polarization Index':
    'A metric indicating how "polarized" your training intensity is (spending time in easy and hard zones, avoiding the middle "grey zone").',
  'L/R Balance':
    'Left/Right Power Balance: The percentage split of total power contributed by each leg.',

  // Other Metrics
  'Max Power': 'The highest power output recorded (usually for 1 second).',
  'Max HR': 'The highest heart rate recorded during the session.',
  'Weighted Avg Power':
    'Similar to Normalized Power, placing more weight on higher-intensity efforts.',
  'FTP at Time':
    'Functional Threshold Power: Your estimated maximum sustainable power for one hour at the time of this workout.',
  RPE: 'Rate of Perceived Exertion: A subjective rating of how hard the workout felt (1-10).',
  'Session RPE': 'A load metric calculated as RPE multiplied by duration in minutes.',
  TRIMP:
    'Training Impulse: A score quantifying training load based on heart rate zones and duration.',
  'Average Cadence': 'The average number of pedal revolutions per minute (RPM).',
  'Max Cadence': 'The highest pedal cadence recorded.',
  'Avg Temperature': 'The average ambient temperature during the activity.',
  'Indoor Trainer': 'Indicates whether the activity was recorded on an indoor trainer.',
  Feel: 'How you felt during the workout (1-5).',

  // Advanced Physiology & Nutrition
  'Strain Score':
    'A cumulative score of physiological strain, often derived from heart rate or power intensity.',
  'HR Load':
    'Heart Rate Load: A training load metric based specifically on heart rate duration and intensity zones.',
  'Work > FTP':
    'The total amount of mechanical work (energy) expended at intensities above your FTP. A key indicator of anaerobic contribution.',
  "W' Bal Depletion":
    "The maximum amount of anaerobic work capacity (W') depleted during the hardest effort of the ride. Indicates how deep you dug.",
  "W'": 'Anaerobic Work Capacity: The total amount of energy available above Critical Power (FTP) before exhaustion.',
  'Carbs Used': 'Estimated carbohydrates consumed by the body during the activity (grams).'
}
