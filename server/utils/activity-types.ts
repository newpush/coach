export const WORKOUT_ICONS: Record<string, string> = {
  Ride: 'i-tabler-bike',
  VirtualRide: 'i-tabler-device-laptop',
  Run: 'i-tabler-run',
  Swim: 'i-tabler-swimming',
  Gym: 'i-tabler-barbell',
  WeightTraining: 'i-tabler-barbell',
  Rest: 'i-tabler-zzz',
  'Active Recovery': 'i-tabler-recharging',
  Walk: 'i-tabler-walk',
  Hike: 'i-tabler-mountain',
  Yoga: 'i-tabler-yoga'
}

export const WORKOUT_COLORS: Record<string, string> = {
  Ride: 'text-green-500',
  VirtualRide: 'text-green-500',
  Run: 'text-orange-500',
  Swim: 'text-cyan-500',
  Gym: 'text-purple-500',
  WeightTraining: 'text-purple-500',
  Rest: 'text-gray-400',
  'Active Recovery': 'text-blue-400',
  Walk: 'text-teal-500',
  Hike: 'text-emerald-600',
  Yoga: 'text-rose-500'
}

export function getWorkoutIcon(type: string): string {
  return WORKOUT_ICONS[type] || 'i-heroicons-question-mark-circle'
}

export function getWorkoutColorClass(type: string): string {
  return WORKOUT_COLORS[type] || 'text-gray-400'
}
