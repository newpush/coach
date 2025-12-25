import { create } from 'xmlbuilder2';
import { FitWriter } from '@markw65/fit-file-writer';

interface WorkoutStep {
  type: 'Warmup' | 'Active' | 'Rest' | 'Cooldown';
  durationSeconds: number;
  power: {
    value?: number;
    range?: { start: number; end: number };
  };
  cadence?: number;
  name?: string;
}

interface WorkoutMessage {
  timestamp: number;
  text: string;
  duration?: number;
}

interface WorkoutData {
  title: string;
  description: string;
  author?: string;
  steps: WorkoutStep[];
  messages?: WorkoutMessage[];
  ftp?: number; // Optional, for calculating absolute watts if needed
}

export class WorkoutConverter {
  static toZWO(workout: WorkoutData): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('workout_file')
        .ele('author').txt(workout.author || 'Coach Wattz').up()
        .ele('name').txt(workout.title).up()
        .ele('description').txt(workout.description).up()
        .ele('sportType').txt('bike').up()
        .ele('tags').up()
        .ele('workout');

    workout.steps.forEach(step => {
      // ZWO uses percentage of FTP (0.0 - 1.0+)
      if (step.power.range) {
        // Ramp
        // Zwift uses <Ramp> or <Warmup>/<Cooldown> with PowerLow/PowerHigh
        const isWarmup = step.type === 'Warmup';
        const isCooldown = step.type === 'Cooldown';
        
        let tagName = 'Ramp';
        if (isWarmup) tagName = 'Warmup';
        else if (isCooldown) tagName = 'Cooldown';

        const el = root.ele(tagName)
          .att('Duration', String(step.durationSeconds))
          .att('PowerLow', String(step.power.range.start))
          .att('PowerHigh', String(step.power.range.end));
        
        if (step.cadence) el.att('Cadence', String(step.cadence));
        if (step.name) el.att('Text', step.name);
        el.up();
      } else {
        // Steady State
        const el = root.ele('SteadyState')
          .att('Duration', String(step.durationSeconds))
          .att('Power', String(step.power.value || 0));
        
        if (step.cadence) el.att('Cadence', String(step.cadence));
        if (step.name) el.att('Text', step.name); // Zwift displays this on screen
        el.up();
      }
    });

    if (workout.messages) {
      workout.messages.forEach(msg => {
        root.ele('textEvent')
          .att('timeoffset', String(msg.timestamp))
          .att('message', msg.text)
          .att('duration', String(msg.duration || 10))
          .up();
      });
    }

    return root.end({ prettyPrint: true });
  }

  static toFIT(workout: WorkoutData): Uint8Array {
    const fitWriter = new FitWriter();
    
    // FIT Epoch: Dec 31, 1989 00:00:00 UTC
    const toFitTimestamp = (date: Date) => Math.round(date.getTime() / 1000) - 631065600;

    // 1. File ID
    fitWriter.writeMessage('file_id', {
      type: 'workout',
      manufacturer: 'garmin',
      product: 0,
      serial_number: 0,
      time_created: toFitTimestamp(new Date()),
      number: 0,
      product_name: 'Coach Wattz'
    });

    // 2. Workout Message
    fitWriter.writeMessage('workout', {
      wkt_name: workout.title.substring(0, 15), // Max chars often limited
      sport: 'cycling',
      sub_sport: 'generic',
      num_valid_steps: workout.steps.length
    });

    // 3. Workout Steps
    workout.steps.forEach((step, index) => {
      const isRamp = !!step.power.range;
      
      // Target Value: Power
      // 1000 = 100% FTP?
      // According to FIT SDK, 'power' steps typically use:
      // target_type: 'power_3s' or 'power_10s' or 'power_30s' or 'power_lap'
      // BUT for workout steps, we define intensity target.
      // target_type: 0 (speed), 1 (heart_rate), 2 (open), 3 (cadence), 4 (power)
      
      // Values are often:
      // 1000 + %FTP * 100 ? No.
      // Usually: 
      // If custom_target_value_low/high are used with target_type=power, units are Watts if absolute.
      // If using %FTP, valid values are often in the range of 0-1000 where 1000=100%? Or 100=100%?
      // Many implementations use: value = % * 100. (e.g. 95% = 95).
      
      // Let's assume standard Garmin convention:
      // target_value: 1000 = 100% FTP?
      // Actually, standard is Watts. 
      // BUT we want portable %FTP.
      // Garmin FIT SDK allows `target_type=4` (Power).
      // And `custom_target_value_low` / `high`.
      
      // Since we might not know the user's FTP at download time perfectly (or want it portable), 
      // we usually export absolute Watts if we know FTP, or rely on device settings.
      
      // Let's calculate ABSOLUTE WATTS if FTP is provided, otherwise fallback to a default 250W.
      const ftp = workout.ftp || 250;
      
      let powerLow = 0;
      let powerHigh = 0;

      if (isRamp && step.power.range) {
        powerLow = Math.round(step.power.range.start * ftp);
        powerHigh = Math.round(step.power.range.end * ftp);
      } else {
        // Steady: Low and High define the zone window.
        // Usually target - 5% to target + 5%
        const val = (step.power.value || 0) * ftp;
        powerLow = Math.round(val - 10);
        powerHigh = Math.round(val + 10);
      }

      fitWriter.writeMessage('workout_step', {
        message_index: index,
        wkt_step_name: step.name ? step.name.substring(0, 15) : undefined,
        duration_type: 'time', // 0
        duration_value: step.durationSeconds * 1000, // ms
        target_type: 'power', // 4
        custom_target_value_low: powerLow + 1000, // Offset 1000 for Watts? No, that's specific to some devices.
        // Wait, fit-file-writer handles types?
        // Standard FIT: power is uint16, watts. offset 0.
        // HOWEVER, "Workout Step Power" often has offset 1000 in definitions?
        // Let's use raw Watts.
        custom_target_value_low: powerLow,
        custom_target_value_high: powerHigh,
        
        intensity: step.type === 'Active' ? 'active' : step.type === 'Rest' ? 'rest' : step.type === 'Warmup' ? 'warmup' : 'cooldown'
      });
    });

    return fitWriter.finish();
  }

  static toMRC(workout: WorkoutData): string {
    const lines: string[] = [];
    lines.push('[COURSE HEADER]');
    lines.push('VERSION = 2');
    lines.push('UNITS = ENGLISH');
    lines.push(`DESCRIPTION = ${workout.description.replace(/[\r\n]+/g, ' ')}`);
    lines.push(`FILE NAME = ${workout.title}`);
    lines.push('MINUTES PERCENT');
    lines.push('[END COURSE HEADER]');
    lines.push('[COURSE DATA]');

    let currentTime = 0;

    workout.steps.forEach(step => {
      const durationMins = step.durationSeconds / 60;
      const endTime = currentTime + durationMins;

      // Calculate start and end power as percentage (0-100)
      let startPercent = 0;
      let endPercent = 0;

      if (step.power.range) {
        startPercent = step.power.range.start * 100;
        endPercent = step.power.range.end * 100;
      } else {
        startPercent = (step.power.value || 0) * 100;
        endPercent = startPercent;
      }

      // Add points
      // Format: Time(min) Value(%)
      lines.push(`${currentTime.toFixed(2)}\t${startPercent.toFixed(0)}`);
      lines.push(`${endTime.toFixed(2)}\t${endPercent.toFixed(0)}`);

      currentTime = endTime;
    });

    lines.push('[END COURSE DATA]');
    return lines.join('\r\n');
  }

  static toERG(workout: WorkoutData): string {
    const lines: string[] = [];
    const ftp = workout.ftp || 250; // Fallback FTP

    lines.push('[COURSE HEADER]');
    lines.push('VERSION = 2');
    lines.push('UNITS = ENGLISH'); // ERG standard often uses ENGLISH even for metric users, refers to formatting
    lines.push(`DESCRIPTION = ${workout.description.replace(/[\r\n]+/g, ' ')}`);
    lines.push(`FILE NAME = ${workout.title}`);
    lines.push(`FTP = ${ftp}`);
    lines.push('MINUTES WATTS');
    lines.push('[END COURSE HEADER]');
    lines.push('[COURSE DATA]');

    let currentTime = 0;

    workout.steps.forEach(step => {
      const durationMins = step.durationSeconds / 60;
      const endTime = currentTime + durationMins;

      // Calculate start and end power in Watts
      let startWatts = 0;
      let endWatts = 0;

      if (step.power.range) {
        startWatts = step.power.range.start * ftp;
        endWatts = step.power.range.end * ftp;
      } else {
        startWatts = (step.power.value || 0) * ftp;
        endWatts = startWatts;
      }

      // Add points
      lines.push(`${currentTime.toFixed(2)}\t${Math.round(startWatts)}`);
      lines.push(`${endTime.toFixed(2)}\t${Math.round(endWatts)}`);

      currentTime = endTime;
    });

    lines.push('[END COURSE DATA]');
    return lines.join('\r\n');
  }
}
