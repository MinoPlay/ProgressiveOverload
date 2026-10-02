export function createInMemoryAdapter({
    exercises = [],
    workouts = [],
    templates = []
} = {}) {
    return {
        exercises: clone(exercises),
        workouts: clone(workouts),
        templates: clone(templates),

        async initializeUser() {},

        async getExercises() {
            return { exercises: clone(this.exercises) };
        },

        async upsertExercises(exercisesToUpsert) {
            upsertById(this.exercises, exercisesToUpsert);
        },

        async deleteExercises(ids) {
            const inUse = this.workouts.some(workout => ids.includes(workout.exerciseId));
            if (inUse) {
                throw new Error('Cannot delete an exercise that has logged workouts.');
            }
            this.exercises = this.exercises.filter(exercise => !ids.includes(exercise.id));
        },

        async getWorkoutsInRange(startDate, endDate) {
            const start = dateString(startDate);
            const end = dateString(endDate);
            return clone(this.workouts)
                .filter(workout => workout.date >= start && workout.date <= end)
                .sort(compareWorkout);
        },

        async getAllWorkouts() {
            return clone(this.workouts).sort(compareWorkout);
        },

        async upsertWorkouts(workoutsToUpsert) {
            upsertById(this.workouts, workoutsToUpsert);
        },

        async deleteWorkouts(ids) {
            this.workouts = this.workouts.filter(workout => !ids.includes(workout.id));
        },

        async getSessionTemplates() {
            return { templates: clone(this.templates) };
        },

        async upsertSessionTemplates(templatesToUpsert) {
            upsertById(this.templates, templatesToUpsert);
        },

        async deleteSessionTemplates(ids) {
            this.templates = this.templates.filter(template => !ids.includes(template.id));
        }
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function upsertById(target, records) {
    records.forEach(record => {
        const copy = clone(record);
        const index = target.findIndex(item => item.id === copy.id);
        if (index === -1) {
            target.push(copy);
        } else {
            target[index] = copy;
        }
    });
}

function dateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function compareWorkout(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if ((a.sequence || 0) !== (b.sequence || 0)) return (a.sequence || 0) - (b.sequence || 0);
    return String(a.id).localeCompare(String(b.id));
}
