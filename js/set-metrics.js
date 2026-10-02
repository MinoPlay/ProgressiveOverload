/**
 * Set Metrics
 * Single source of truth for how a logged set is measured.
 */

/**
 * Volume of one set for per-exercise progress: reps × weight for weighted
 * exercises with a recorded weight, otherwise reps.
 * @param {{reps: number, weight: (number|null)}} set - Logged set
 * @param {{requiresWeight: boolean}} exercise - Exercise the set belongs to
 * @returns {number} Set volume
 */
export function setVolume(set, exercise) {
    return exercise && exercise.requiresWeight && set.weight
        ? set.reps * set.weight
        : set.reps;
}

/**
 * Load moved by one set (reps × weight); bodyweight sets count as 0.
 * Safe to sum across different exercises.
 * @param {{reps: number, weight: (number|null)}} set - Logged set
 * @returns {number} Set tonnage
 */
export function setTonnage(set) {
    return (set.weight || 0) * set.reps;
}
