export const WORKOUT_ICONS: Record<string, string> = {
  Ride: 'i-tabler-bike',
  VirtualRide: 'i-tabler-device-laptop',
  MountainBikeRide: 'i-tabler-bike',
  GravelRide: 'i-tabler-bike',
  Run: 'i-tabler-run',
  VirtualRun: 'i-tabler-device-laptop',
  TrailRun: 'i-tabler-run',
  Swim: 'i-tabler-swimming',
  Gym: 'i-tabler-barbell',
  WeightTraining: 'i-tabler-barbell',
  Rest: 'i-tabler-zzz',
  'Active Recovery': 'i-tabler-recharging',
  Walk: 'i-tabler-walk',
  Hike: 'i-tabler-mountain',
  Yoga: 'i-tabler-yoga',
  Rowing: 'i-lucide-waves',
  AlpineSki: 'i-lucide-snowflake',
  NordicSki: 'i-lucide-snowflake',
  Snowboard: 'i-tabler-snowboarding',
  Elliptical: 'i-tabler-activity',
  StairStepper: 'i-tabler-stairs',
  RockClimbing: 'i-tabler-mountain',
  StandUpPaddling: 'i-lucide-ship',
  Kayaking: 'i-lucide-ship',
  Surfing: 'i-lucide-waves',
  Crossfit: 'i-tabler-barbell',
  HIIT: 'i-tabler-flame',
  BoxFitness: 'i-tabler-boxing-glove',
  Kickboxing: 'i-tabler-boxing-glove',
  MartialArts: 'i-tabler-karate',
  Golf: 'i-tabler-golf',
  Tennis: 'i-tabler-ball-tennis',
  Squash: 'i-tabler-ball-tennis',
  Badminton: 'i-tabler-ball-tennis',
  TableTennis: 'i-tabler-ping-pong',
  Soccer: 'i-tabler-ball-football',
  Football: 'i-tabler-ball-american-football',
  Basketball: 'i-tabler-ball-basketball',
  Baseball: 'i-tabler-ball-baseball',
  Volleyball: 'i-tabler-ball-volleyball',
  IceSkate: 'i-tabler-ice-skating',
  InlineSkate: 'i-tabler-skateboarding',
  Skateboarding: 'i-tabler-skateboarding',
  Commute: 'i-tabler-bus',
  Gardening: 'i-tabler-seeding',
  Sauna: 'i-tabler-bath',
  IceBath: 'i-tabler-snowflake',
  Massage: 'i-tabler-massage',
  Recovery: 'i-tabler-heartbeat',
  Meditation: 'i-lucide-leaf',
  Pilates: 'i-tabler-stretching'
}

export const WORKOUT_COLORS: Record<string, string> = {
  Ride: 'text-green-500',
  VirtualRide: 'text-green-500',
  MountainBikeRide: 'text-green-600',
  GravelRide: 'text-green-600',
  Run: 'text-orange-500',
  VirtualRun: 'text-orange-500',
  TrailRun: 'text-orange-600',
  Swim: 'text-cyan-500',
  Gym: 'text-purple-500',
  WeightTraining: 'text-purple-500',
  Rest: 'text-gray-400',
  'Active Recovery': 'text-blue-400',
  Walk: 'text-teal-500',
  Hike: 'text-emerald-600',
  Yoga: 'text-rose-500',
  Rowing: 'text-cyan-600',
  AlpineSki: 'text-blue-500',
  NordicSki: 'text-blue-600',
  Snowboard: 'text-blue-500',
  Elliptical: 'text-teal-600',
  StairStepper: 'text-orange-400',
  RockClimbing: 'text-stone-500',
  Crossfit: 'text-red-600',
  HIIT: 'text-red-500',
  Soccer: 'text-green-600',
  Basketball: 'text-orange-600',
  Tennis: 'text-yellow-500',
  Golf: 'text-green-700',
  IceBath: 'text-cyan-300',
  Sauna: 'text-red-400',
  Massage: 'text-purple-400',
  Recovery: 'text-blue-300',
  Commute: 'text-gray-500'
}

export const WORKOUT_BORDER_COLORS: Record<string, string> = {
  Ride: 'border-green-500',
  VirtualRide: 'border-green-500',
  MountainBikeRide: 'border-green-600',
  GravelRide: 'border-green-600',
  Run: 'border-orange-500',
  VirtualRun: 'border-orange-500',
  TrailRun: 'border-orange-600',
  Swim: 'border-cyan-500',
  Gym: 'border-purple-500',
  WeightTraining: 'border-purple-500',
  Rest: 'border-gray-200 dark:border-gray-700',
  'Active Recovery': 'border-blue-400',
  Walk: 'border-teal-500',
  Hike: 'border-emerald-600',
  Yoga: 'border-rose-500'
}

export function getWorkoutIcon(type: string): string {
  return WORKOUT_ICONS[type] || 'i-heroicons-question-mark-circle'
}

export function getWorkoutColorClass(type: string): string {
  return WORKOUT_COLORS[type] || 'text-gray-400'
}

export function getWorkoutBorderColorClass(type: string): string {
  return WORKOUT_BORDER_COLORS[type] || 'border-gray-200'
}
