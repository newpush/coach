# Strava HR Stream Data Ingestion

## Overview

The system now automatically fetches and stores heart rate (HR) stream data for all Strava activities that have HR data, regardless of activity type.

## What Changed

### Before

- HR stream data was only fetched for specific activity types: Run, Ride, VirtualRide, Walk, Hike
- Activities like "Elliptical" (classified as "Other") were skipped even if they had HR data

### After

- HR stream data is fetched for ALL activities that have heart rate or power data
- This includes elliptical, rowing, skiing, and any other activity type with HR monitoring

## How It Works

### During Strava Sync

When the Strava sync trigger runs:

1. Fetches activity summaries from Strava API
2. For each new or updated activity, fetches detailed data
3. NEW: Checks if activity has has_heartrate or device_watts flags
4. If yes, triggers the ingest-strava-streams task to fetch time-series data
5. Automatically backfills up to 5 recent workouts missing streams

### Stream Ingestion Task

The stream ingestion task performs these steps:

1. Fetches streams from Strava: heartrate, time, distance, velocity, watts, cadence, altitude, GPS, gradient, movement
2. Calculates pacing metrics: lap splits, pace variability, average pace, pacing strategy, surge detection
3. Stores all data in the WorkoutStream table

## CLI Tools

### Check if workout has HR stream in database

npx tsx scripts/check-workout-hr-stream.ts [workout-id]

### Check if Strava API has HR stream

npx tsx scripts/check-strava-hr-stream.ts [workout-id]

### Backfill existing workouts

npx tsx scripts/backfill-strava-streams.ts

## Benefits

1. Complete Data Coverage: No more missing HR data due to activity type
2. Rich Analysis: Time-series data enables deeper insights than just averages
3. Automatic: Runs on every sync, no manual intervention needed
4. Efficient: Only fetches streams for activities with relevant data
5. Backfill Support: Can catch up on historical data
