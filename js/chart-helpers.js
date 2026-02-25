/**
 * Chart Helper Utilities
 * Calculation functions for advanced chart visualizations
 */

/**
 * Calculate linear regression for trend line
 * @param {Array<{x: number, y: number}>} dataPoints - Array of {x, y} coordinate objects
 * @returns {{slope: number, intercept: number, predict: Function}} Regression parameters and prediction function
 */
export function calculateLinearRegression(dataPoints) {
    if (!dataPoints || dataPoints.length < 2) {
        return { slope: 0, intercept: 0, predict: () => 0 };
    }

    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (const point of dataPoints) {
        sumX += point.x;
        sumY += point.y;
        sumXY += point.x * point.y;
        sumX2 += point.x * point.x;
    }

    // Calculate slope (m) and intercept (b) for y = mx + b
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return {
        slope,
        intercept,
        predict: (x) => slope * x + intercept,
        // Helper to generate trend line points
        getTrendLine: (xValues) => xValues.map(x => slope * x + intercept)
    };
}

/**
 * Calculate moving average with configurable window size
 * @param {Array<number>} values - Array of numeric values
 * @param {number} windowSize - Number of values to average (default: 7)
 * @returns {Array<number|null>} Moving average array (nulls for insufficient data points)
 */
export function calculateMovingAverage(values, windowSize = 7) {
    if (!values || values.length === 0) return [];

    const result = [];

    for (let i = 0; i < values.length; i++) {
        if (i < windowSize - 1) {
            // Not enough data points yet
            result.push(null);
        } else {
            // Calculate average of window
            let sum = 0;
            for (let j = 0; j < windowSize; j++) {
                sum += values[i - j];
            }
            result.push(sum / windowSize);
        }
    }

    return result;
}

/**
 * Categorize rep count into training type
 * @param {number} reps - Number of repetitions
 * @returns {'strength'|'hypertrophy'|'endurance'} Training category
 */
export function categorizeRepRange(reps) {
    if (reps <= 5) return 'strength';
    if (reps <= 12) return 'hypertrophy';
    return 'endurance';
}

/**
 * Aggregate workouts by week with totals and frequency
 * @param {Array<Object>} workouts - Array of workout objects with {date, reps, weight}
 * @returns {Array<{weekStart: string, totalVolume: number, totalReps: number, frequency: number, avgWeight: number}>}
 */
export function aggregateByWeek(workouts) {
    if (!workouts || workouts.length === 0) return [];

    const weekMap = new Map();

    for (const workout of workouts) {
        const date = new Date(workout.date);
        // Get Monday of the week
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        const weekKey = monday.toISOString().split('T')[0];

        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, {
                weekStart: weekKey,
                totalVolume: 0,
                totalReps: 0,
                frequency: 0,
                totalWeight: 0,
                workoutDates: new Set(),
                uniqueExerciseNames: new Set(),
                muscleGroupCounts: {}, // { muscleName: Set(exerciseNames) }
                muscleGroupSessions: {}, // { muscleName: Set(dates) }
                muscleGroupVolume: {} // { muscleName: number }
            });
        }

        const weekData = weekMap.get(weekKey);
        const volume = (workout.weight || 0) * workout.reps;
        weekData.totalVolume += volume;
        weekData.totalReps += workout.reps;
        weekData.totalWeight += (workout.weight || 0);
        weekData.workoutDates.add(workout.date);

        if (workout.exerciseName || workout.exerciseId) {
            const exerciseKey = workout.exerciseId || workout.exerciseName;
            weekData.uniqueExerciseNames.add(exerciseKey);

            if (workout.muscle) {
                if (!weekData.muscleGroupCounts[workout.muscle]) {
                    weekData.muscleGroupCounts[workout.muscle] = new Set();
                    weekData.muscleGroupSessions[workout.muscle] = new Set();
                    weekData.muscleGroupVolume[workout.muscle] = 0;
                }
                // Track unique exercises (different movements)
                weekData.muscleGroupCounts[workout.muscle].add(exerciseKey);
                // Track unique training days (sessions) for this muscle
                if (workout.date) {
                    weekData.muscleGroupSessions[workout.muscle].add(workout.date);
                }
                // Track total volume for this muscle
                weekData.muscleGroupVolume[workout.muscle] += volume;
            }
        }
    }

    // Convert to array and calculate averages
    return Array.from(weekMap.values())
        .map(week => {
            const muscles = {};
            const muscleSessions = {};
            const muscleVolume = {};

            Object.keys(week.muscleGroupCounts).forEach(m => {
                muscles[m] = week.muscleGroupCounts[m].size;
                muscleSessions[m] = week.muscleGroupSessions[m].size;
                muscleVolume[m] = Math.round(week.muscleGroupVolume[m] * 10) / 10;
            });

            return {
                weekStart: week.weekStart,
                totalVolume: Math.round(week.totalVolume * 10) / 10,
                totalReps: week.totalReps,
                frequency: week.workoutDates.size,
                uniqueExercisesCount: week.uniqueExerciseNames.size,
                muscleGroupCounts: muscles,
                muscleGroupSessions: muscleSessions,
                muscleGroupVolume: muscleVolume,
                avgWeight: week.totalWeight > 0 ? Math.round((week.totalWeight / week.frequency) * 10) / 10 : 0
            };
        })
        .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
}

/**
 * Calculate percentage change between two values
 * @param {number} oldValue - Previous value
 * @param {number} newValue - Current value
 * @returns {{percent: number, direction: 'up'|'down'|'same', formatted: string}}
 */
export function calculatePercentChange(oldValue, newValue) {
    if (!oldValue || oldValue === 0) {
        return { percent: 0, direction: 'same', formatted: '0%' };
    }

    const change = ((newValue - oldValue) / oldValue) * 100;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
    const formatted = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;

    return {
        percent: Math.round(change * 10) / 10,
        direction,
        formatted
    };
}

/**
 * Find personal records in workout data
 * @param {Array<Object>} workouts - Array of workout objects with {date, reps, weight}
 * @returns {Array<{date: string, reps: number, weight: number, volume: number, type: string}>}
 */
export function findPersonalRecords(workouts) {
    if (!workouts || workouts.length === 0) return [];

    const records = [];
    let maxWeight = 0;
    let maxReps = 0;
    let maxVolume = 0;

    // Sort by date to track progressive records
    const sortedWorkouts = [...workouts].sort((a, b) =>
        new Date(a.date) - new Date(b.date)
    );

    for (const workout of sortedWorkouts) {
        const volume = (workout.weight || 0) * workout.reps;
        const recordTypes = [];

        // Check for weight PR
        if (workout.weight && workout.weight > maxWeight) {
            maxWeight = workout.weight;
            recordTypes.push('weight');
        }

        // Check for reps PR
        if (workout.reps > maxReps) {
            maxReps = workout.reps;
            recordTypes.push('reps');
        }

        // Check for volume PR
        if (volume > maxVolume) {
            maxVolume = volume;
            recordTypes.push('volume');
        }

        if (recordTypes.length > 0) {
            records.push({
                date: workout.date,
                reps: workout.reps,
                weight: workout.weight || 0,
                volume: Math.round(volume * 10) / 10,
                type: recordTypes.join('+')
            });
        }
    }

    return records;
}

/**
 * Calculate volume distribution across rep ranges
 * @param {Array<Object>} workouts - Array of workout objects
 * @returns {{strength: number, hypertrophy: number, endurance: number}}
 */
export function calculateVolumeDistribution(workouts) {
    if (!workouts || workouts.length === 0) {
        return { strength: 0, hypertrophy: 0, endurance: 0 };
    }

    const distribution = {
        strength: 0,
        hypertrophy: 0,
        endurance: 0
    };

    for (const workout of workouts) {
        const category = categorizeRepRange(workout.reps);
        const volume = (workout.weight || 0) * workout.reps;
        distribution[category] += volume;
    }

    return {
        strength: Math.round(distribution.strength * 10) / 10,
        hypertrophy: Math.round(distribution.hypertrophy * 10) / 10,
        endurance: Math.round(distribution.endurance * 10) / 10
    };
}

/**
 * Calculate session count distribution across rep ranges
 * @param {Array<Object>} workouts - Array of workout objects
 * @returns {{strength: number, hypertrophy: number, endurance: number}}
 */
export function calculateSessionDistribution(workouts) {
    if (!workouts || workouts.length === 0) {
        return { strength: 0, hypertrophy: 0, endurance: 0 };
    }

    const distribution = {
        strength: 0,
        hypertrophy: 0,
        endurance: 0
    };

    for (const workout of workouts) {
        const category = categorizeRepRange(workout.reps);
        distribution[category]++;
    }

    return distribution;
}

/**
 * Normalize data to percentage of maximum value
 * @param {Array<number>} values - Array of numeric values
 * @returns {Array<number>} Normalized values (0-100%)
 */
export function normalizeToPercent(values) {
    if (!values || values.length === 0) return [];

    const max = Math.max(...values);
    if (max === 0) return values.map(() => 0);

    return values.map(v => (v / max) * 100);
}

/**
 * Calculate progress percentage relative to baseline
 * Uses the average of the first 3 workouts (or fewer if not available) as baseline
 * @param {Array<number>} values - Array of numeric values in chronological order
 * @returns {Array<number>} Progress percentages (100 = baseline, >100 = improvement, <100 = decline)
 */
export function calculateProgressPercentage(values) {
    if (!values || values.length === 0) return [];

    // Calculate baseline: average of first 1-3 workouts
    const baselineCount = Math.min(3, values.length);
    const baseline = values.slice(0, baselineCount).reduce((sum, val) => sum + val, 0) / baselineCount;

    if (baseline === 0) return values.map(() => 0);

    // Convert each value to percentage of baseline
    return values.map(v => (v / baseline) * 100);
}

/**
 * Estimate 1 Rep Max using Brzycki formula
 * @param {number} weight - Weight lifted
 * @param {number} reps - Number of repetitions
 * @returns {number} Estimated 1RM
 */
export function estimate1RM(weight, reps) {
    if (!weight || !reps) return 0;
    if (reps === 1) return weight;
    // Brzycki Formula: Weight * (36 / (37 - reps))
    // Only valid for reps <= 10 for best accuracy, but we'll use it for all
    return weight * (36 / (37 - Math.min(reps, 30)));
}
