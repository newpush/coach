// Standardized Activity Types used across the platform
// These should match the keys in app/utils/activity-types.ts where possible
// or be standard types recognizable by other platforms (Intervals.icu, Strava)

export const WHOOP_SPORT_MAP: Record<number, string> = {
  [-1]: 'Other', // Activity
  0: 'Run',
  1: 'Ride', // Cycling
  16: 'Baseball',
  17: 'Basketball',
  18: 'Rowing',
  19: 'Fencing',
  20: 'Field Hockey',
  21: 'Football', // American Football likely
  22: 'Golf',
  24: 'Ice Hockey',
  25: 'Lacrosse',
  27: 'Rugby',
  28: 'Sailing',
  29: 'AlpineSki', // Skiing
  30: 'Soccer',
  31: 'Softball',
  32: 'Squash',
  33: 'Swim',
  34: 'Tennis',
  35: 'Run', // Track & Field - mostly running?
  36: 'Volleyball',
  37: 'Swim', // Water Polo - or generic Swim? Or custom
  38: 'Wrestling',
  39: 'Boxing',
  42: 'Dance',
  43: 'Pilates',
  44: 'Yoga',
  45: 'WeightTraining',
  47: 'NordicSki', // Cross Country Skiing
  48: 'Crossfit', // Functional Fitness
  49: 'Run', // Duathlon - usually Run/Bike, difficult to map to single type.
  51: 'Gymnastics',
  52: 'Hike', // Hiking/Rucking
  53: 'Ride', // Horseback Riding - Wait, Horseback isn't Ride (Bike). Map to Other or HorsebackRiding
  55: 'Kayaking',
  56: 'Martial Arts',
  57: 'MountainBikeRide', // Mountain Biking
  59: 'WeightTraining', // Powerlifting
  60: 'RockClimbing',
  61: 'StandUpPaddling', // Paddleboarding
  62: 'Triathlon', // Difficult to map to single. Maybe 'Triathlon' type exists?
  63: 'Walk',
  64: 'Surfing',
  65: 'Elliptical',
  66: 'StairStepper', // Stairmaster
  70: 'Yoga', // Meditation - map to Yoga or separate? Intervals has 'Yoga' or 'Meditate'?
  71: 'Other',
  73: 'Swim', // Diving
  74: 'Other', // Operations - Tactical
  75: 'Other', // Operations - Medical
  76: 'Other', // Operations - Flying
  77: 'Other', // Operations - Water
  82: 'Frisbee', // Ultimate
  83: 'RockClimbing', // Climber
  84: 'Workout', // Jumping Rope - generic workout?
  85: 'Football', // Australian Football
  86: 'Skateboarding',
  87: 'Other', // Coaching
  88: 'IceBath', // Ice Bath - Recovery
  89: 'Commute', // Commuting - could be Walk or Ride.
  90: 'Other', // Gaming
  91: 'Snowboard',
  92: 'Motocross',
  93: 'Walk', // Caddying
  94: 'Run', // Obstacle Course Racing
  95: 'Other', // Motor Racing
  96: 'HIIT',
  97: 'VirtualRide', // Spin -> Indoor Cycling
  98: 'Martial Arts', // Jiu Jitsu
  99: 'Other', // Manual Labor
  100: 'Cricket',
  101: 'Pickleball',
  102: 'InlineSkate',
  103: 'Box Fitness', // Box Fitness
  104: 'Other', // Spikeball
  105: 'Walk', // Wheelchair Pushing
  106: 'Tennis', // Paddle Tennis
  107: 'Barre',
  108: 'Other', // Stage Performance
  109: 'Other', // High Stress Work
  110: 'Run', // Parkour
  111: 'Football', // Gaelic Football
  112: 'Other', // Hurling/Camogie
  113: 'Other', // Circus Arts
  121: 'Massage', // Massage Therapy
  123: 'WeightTraining', // Strength Trainer
  125: 'Other', // Watching Sports
  126: 'VirtualRide', // Assault Bike
  127: 'Kickboxing',
  128: 'Yoga', // Stretching - often mapped to Yoga/Flexibility
  230: 'TableTennis',
  231: 'Badminton',
  232: 'Other', // Netball
  233: 'Sauna',
  234: 'Other', // Disc Golf
  235: 'Gardening', // Yard Work
  236: 'Recovery', // Air Compression
  237: 'Recovery', // Percussive Massage
  238: 'Other', // Paintball
  239: 'IceSkate',
  240: 'Handball',
  248: 'HIIT', // F45 Training
  249: 'Tennis', // Padel
  250: 'HIIT', // Barry's
  251: 'Other', // Dedicated Parenting
  252: 'Walk', // Stroller Walking
  253: 'Run', // Stroller Jogging
  254: 'Walk', // Toddlerwearing
  255: 'Walk', // Babywearing
  258: 'Barre', // Barre3
  259: 'Yoga', // Hot Yoga
  261: 'StairStepper', // Stadium Steps
  262: 'Other', // Polo
  263: 'Other', // Musical Performance
  264: 'Kitesurf', // Kite Boarding
  266: 'Walk', // Dog Walking
  267: 'WaterSki', // Water Skiing
  268: 'Wakeboard', // Wakeboarding
  269: 'Other', // Cooking
  270: 'Other', // Cleaning
  272: 'Other' // Public Speaking
}

// Helper to normalize unknown IDs
export function normalizeWhoopSport(sportId: number): string {
  return WHOOP_SPORT_MAP[sportId] || 'Other'
}
