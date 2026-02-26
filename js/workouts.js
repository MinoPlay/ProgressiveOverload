// Workouts Module
// Handles workout logging UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';
import { CONFIG } from './config.js';
import { isValidDate, validateNumber, formatDate } from './utils.js';

export const Workouts = {
    /**
     * Initialize workout logging UI
     */
    init() {
        this.bindEvents();
        this.populateMuscleDropdown();
        this.populateExerciseDropdown();
        this.setDefaultDate();
        this.updateDateTooltip();
        this.renderLastWorkoutSummary();

        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.populateMuscleDropdown();
            const muscleSelect = document.getElementById('workoutMuscle');
            this.populateExerciseDropdown(muscleSelect ? muscleSelect.value : '');
        });


    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const form = document.getElementById('workoutFormElement');
        const muscleSelect = document.getElementById('workoutMuscle');
        const exerciseSelect = document.getElementById('workoutExercise');
        const clearBtn = document.getElementById('clearWorkoutBtn');

        form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Filter exercises based on muscle selection
        muscleSelect.addEventListener('change', () => {
            this.populateExerciseDropdown(muscleSelect.value);
            // Trigger exercise selection logic
            this.updateWeightField();
        });

        // Show/hide weight field and clear reps/weight based on exercise selection
        exerciseSelect.addEventListener('change', () => {
            const repsInput = document.getElementById('workoutReps');
            const weightInput = document.getElementById('workoutWeight');

            if (repsInput) repsInput.value = '';
            if (weightInput) weightInput.value = '';

            this.updateWeightField();
        });

        // Clear form button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearForm());
        }

        // Update tooltip when date changes
        const dateInput = document.getElementById('workoutDate');
        if (dateInput) {
            dateInput.addEventListener('change', () => this.updateDateTooltip());
        }
    },

    /**
     * Populate muscle dropdown
     */
    populateMuscleDropdown() {
        const select = document.getElementById('workoutMuscle');
        if (!select) return;

        const exercises = Storage.getExercises();
        const muscles = [...new Set(exercises.map(ex => ex.muscle).filter(Boolean))];

        // Keep first option
        const currentValue = select.value;
        select.innerHTML = '<option value="">All Muscles</option>';

        // Sort muscles alphabetically
        muscles.sort((a, b) => a.localeCompare(b));

        muscles.forEach(muscle => {
            const option = document.createElement('option');
            option.value = muscle;
            option.textContent = muscle.charAt(0).toUpperCase() + muscle.slice(1);
            select.appendChild(option);
        });

        // Restore value if it still exists
        if (muscles.includes(currentValue)) {
            select.value = currentValue;
        }
    },

    /**
     * Populate exercise dropdown
     * @param {string} muscleFilter - Optional muscle to filter by
     */
    populateExerciseDropdown(muscleFilter = '') {
        const select = document.getElementById('workoutExercise');
        let exercises = Storage.getExercises();

        // Apply filter if provided
        if (muscleFilter) {
            exercises = exercises.filter(ex => ex.muscle === muscleFilter);
        }

        // Keep first option (placeholder)
        select.innerHTML = '<option value="">Select Exercise...</option>';

        // Sort exercises alphabetically by name
        exercises.sort((a, b) => a.name.localeCompare(b.name));

        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.name;
            option.dataset.requiresWeight = exercise.requiresWeight;
            select.appendChild(option);
        });
    },

    /**
     * Update weight field visibility and show last workout info based on selected exercise
     */
    updateWeightField() {
        const select = document.getElementById('workoutExercise');
        const weightGroup = document.getElementById('weightGroup');
        const weightInput = document.getElementById('workoutWeight');

        if (select.value) {
            const selectedOption = select.options[select.selectedIndex];
            const requiresWeight = selectedOption.dataset.requiresWeight === 'true';

            if (requiresWeight) {
                weightGroup.style.display = 'block';
                weightInput.required = true;
            } else {
                weightGroup.style.display = 'none';
                weightInput.required = false;
                weightInput.value = '';
            }

            // Show last workout info
            this.updateLastWorkoutInfo(select.value);
        } else {
            // Hide last workout info if no exercise selected
            const infoContainer = document.getElementById('lastWorkoutInfo');
            if (infoContainer) infoContainer.style.display = 'none';
        }
    },

    /**
     * Show compact last workout info for the selected exercise
     * @param {string} exerciseId - Selected exercise ID
     */
    async updateLastWorkoutInfo(exerciseId) {
        const infoContainer = document.getElementById('lastWorkoutInfo');
        if (!infoContainer) return;

        // Reset and show loading state if it takes a moment
        infoContainer.innerHTML = '<span class="label">Loading last sessions...</span>';
        infoContainer.style.display = 'inline-flex';

        try {
            // Get last 3 sessions
            const lastSessions = await Storage.getLastWorkoutSessionsForExercise(exerciseId, 3);

            if (!lastSessions || lastSessions.length === 0) {
                infoContainer.innerHTML = '<span class="label"><i data-lucide="clock" class="icon-xs"></i> No history found.</span>';
                infoContainer.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            infoContainer.innerHTML = '';
            infoContainer.style.display = 'flex';

            const header = document.createElement('div');
            header.className = 'label';
            header.innerHTML = `<i data-lucide="clock" class="icon-xs"></i> ${lastSessions.length > 1 ? `Last ${lastSessions.length} Sessions:` : 'Previous Session:'}`;
            infoContainer.appendChild(header);

            // Identify current vs previous session
            const todayStr = formatDate(new Date());
            const currentSession = lastSessions[0]?.date === todayStr ? lastSessions[0] : null;
            const previousSession = lastSessions[0]?.date === todayStr ? lastSessions[1] : lastSessions[0];

            // Add Volume Suggestion for the most recent session
            const { suggestions, maxVolume, currentVolume } = this.calculateVolumeSuggestions(currentSession, previousSession);
            if (suggestions && (suggestions.length > 0 || currentVolume > 0)) {
                const suggestionBox = this.renderVolumeSuggestions(suggestions, maxVolume, currentVolume);
                infoContainer.appendChild(suggestionBox);
            }

            const sessionsContainer = document.createElement('div');
            sessionsContainer.className = 'sessions-horizontal';

            lastSessions.forEach((session) => {
                const sessionBox = document.createElement('div');
                sessionBox.className = 'session-box';

                const setsContainer = document.createElement('div');
                setsContainer.className = 'sets-list';

                session.sets.forEach((set) => {
                    const setBadge = document.createElement('span');
                    setBadge.className = 'set-badge-item';

                    let text = `${set.reps}`;
                    if (set.weight !== null && set.weight !== undefined) {
                        text += `x${set.weight}`;
                    }

                    setBadge.textContent = text;
                    setsContainer.appendChild(setBadge);
                });

                sessionBox.appendChild(setsContainer);
                sessionsContainer.appendChild(sessionBox);
            });

            infoContainer.appendChild(sessionsContainer);
        } catch (error) {
            console.error('Error updating last workout info:', error);
            infoContainer.style.display = 'none';
        }
    },

    /**
     * Calculate volume suggestions based on previous performance and current session progress
     * @param {object} currentSession - Today's session data (if any)
     * @param {object} previousSession - Most recent session before today
     * @returns {object} Object containing suggestions array and volume statistics
     */
    calculateVolumeSuggestions(currentSession, previousSession) {
        if (!previousSession || !previousSession.sets.length) return { suggestions: [], maxVolume: 0, currentVolume: 0 };

        // Helper to calculate total volume for a session
        const getSessionVolume = (session) => {
            if (!session) return 0;
            return session.sets.reduce((sum, set) => {
                const w = parseFloat(set.weight);
                const r = parseInt(set.reps, 10);
                // For bodyweight, treat weight as 0 or 1 depending on how we handle it
                const weight = (!isNaN(w) && w !== null) ? w : 0;
                return sum + (weight * r);
            }, 0);
        };

        const totalVolumePrev = getSessionVolume(previousSession);
        const totalVolumeCurr = currentSession ? getSessionVolume(currentSession) : 0;

        // Find best set of previous session for individual set suggestions
        let maxSetVolumePrev = 0;
        let bestSetPrev = null;
        previousSession.sets.forEach(set => {
            const w = parseFloat(set.weight);
            const r = parseInt(set.reps, 10);
            const vol = (!isNaN(w) && w !== null) ? (w * r) : r;
            if (vol >= maxSetVolumePrev) {
                maxSetVolumePrev = vol;
                bestSetPrev = { weight: (!isNaN(w) && w !== null) ? w : null, reps: r };
            }
        });

        const suggestions = [];

        if (totalVolumeCurr > 0) {
            // User has already logged at least one set today
            const targetVolume = totalVolumePrev;
            const remainingVolume = targetVolume - totalVolumeCurr;

            if (remainingVolume <= 0) {
                // Goal already met!
                suggestions.push({
                    label: 'Volume Goal Met! 🎉',
                    reps: 'PR',
                    weight: 'Set',
                    isMessage: true
                });
            } else {
                // Suggest how to reach the goal
                const lastSet = currentSession.sets[currentSession.sets.length - 1];
                const lastWeightUsed = parseFloat(lastSet.weight);
                const prevSetsCount = previousSession.sets.length;
                const currSetsCount = currentSession.sets.length;
                // Assume user wants to do at least as many sets as last time
                const remainingSets = Math.max(1, prevSetsCount - currSetsCount);
                const neededVolPerSet = Math.ceil(remainingVolume / remainingSets);

                const isWeighted = !isNaN(lastWeightUsed) && lastWeightUsed !== null;

                if (isWeighted && lastWeightUsed > 0) {
                    // Suggestion 1: Use current weight
                    const neededReps = Math.ceil(neededVolPerSet / lastWeightUsed);
                    if (neededReps > 0 && neededReps < 100) {
                        suggestions.push({
                            weight: lastWeightUsed,
                            reps: Math.max(1, neededReps),
                            label: `Stay at ${lastWeightUsed}kg (${remainingSets} set${remainingSets > 1 ? 's' : ''} left)`
                        });
                    }

                    // Suggestion 2: Small weight increase
                    const nextWeight = lastWeightUsed + 2.5;
                    const neededRepsNext = Math.ceil(neededVolPerSet / nextWeight);
                    if (neededRepsNext > 0 && neededRepsNext < 100) {
                        suggestions.push({
                            weight: nextWeight,
                            reps: Math.max(1, neededRepsNext),
                            label: `+2.5kg (${remainingSets} set${remainingSets > 1 ? 's' : ''} left)`
                        });
                    }
                } else {
                    // Bodyweight - suggest reps to match volume (which is just reps if weight is 0)
                    const neededReps = Math.ceil(remainingVolume / remainingSets);
                    if (neededReps > 0) {
                        suggestions.push({
                            weight: null,
                            reps: neededReps,
                            label: `Target Reps (${remainingSets} set${remainingSets > 1 ? 's' : ''} left)`
                        });
                    }
                }
            }
        } else if (bestSetPrev) {
            // First time selecting exercise today - suggest beating previous best set
            suggestions.push({
                weight: bestSetPrev.weight,
                reps: bestSetPrev.reps + 1,
                label: 'Beat Best Set'
            });

            if (bestSetPrev.weight !== null) {
                const increments = [1, 2.5];
                increments.forEach(inc => {
                    const suggestedWeight = bestSetPrev.weight + inc;
                    const suggestedReps = Math.ceil(maxSetVolumePrev / suggestedWeight);
                    if (suggestedReps > 0 && suggestedReps < 100) {
                        suggestions.push({
                            weight: suggestedWeight,
                            reps: suggestedReps,
                            label: `+${inc}kg`
                        });
                    }
                });
            }
        }

        // Deduplicate
        const uniqueSuggestions = [];
        const seen = new Set();
        suggestions.forEach(s => {
            const key = s.isMessage ? s.label : `${s.reps}x${s.weight}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueSuggestions.push(s);
            }
        });

        return {
            suggestions: uniqueSuggestions.slice(0, 3),
            maxVolume: totalVolumePrev,
            currentVolume: totalVolumeCurr
        };
    },

    /**
     * Render volume suggestions as a UI element
     * @param {array} suggestions - Array of suggestion objects
     * @param {number} maxVolume - Previous max volume
     * @param {number} currentVolume - Today's volume so far
     * @returns {HTMLElement} Suggestion container
     */
    renderVolumeSuggestions(suggestions, maxVolume, currentVolume = 0) {
        const container = document.createElement('div');
        container.className = 'volume-suggestions';

        const hint = document.createElement('div');
        hint.className = 'suggestion-hint';

        if (currentVolume > 0 && maxVolume > 0) {
            const percentage = Math.min(100, (currentVolume / maxVolume) * 100).toFixed(0);
            hint.innerHTML = `<i data-lucide="zap" class="icon-xs"></i> <strong>Volume:</strong> ${currentVolume.toFixed(0)} / ${maxVolume.toFixed(0)} kg <span class="percentage-pill" style="background: var(--primary-light); color: var(--primary-color); padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px;">${percentage}%</span>`;
        } else {
            hint.innerHTML = '<i data-lucide="zap" class="icon-xs"></i> <strong>Progress Tip:</strong> To beat previous session, try:';
        }

        container.appendChild(hint);
        if (window.lucide) window.lucide.createIcons();

        const list = document.createElement('div');
        list.className = 'suggestion-chips-container';
        list.style.display = 'flex';
        list.style.flexWrap = 'wrap';
        list.style.gap = '4px';
        list.style.marginTop = '4px';

        suggestions.forEach(s => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';

            if (s.isMessage) {
                chip.innerHTML = `<span>${s.label}</span>`;
                chip.style.backgroundColor = 'var(--success-light)';
                chip.style.borderColor = 'var(--success-color)';
                chip.style.color = 'var(--success-color)';
                chip.style.cursor = 'default';
            } else {
                const weightText = (s.weight !== null && s.weight !== undefined) ? `x${s.weight}` : '';
                chip.title = (s.weight !== null && s.weight !== undefined) ? `Predicted Set Volume: ${(s.reps * s.weight).toFixed(1)}kg` : `Target: ${s.reps} reps`;
                chip.innerHTML = `<strong>${s.reps}${weightText}</strong> <span class="label-tag">${s.label}</span>`;

                chip.addEventListener('click', (e) => {
                    e.preventDefault();
                    const repsInput = document.getElementById('workoutReps');
                    const weightInput = document.getElementById('workoutWeight');

                    if (repsInput) repsInput.value = s.reps;
                    if (weightInput && s.weight !== null) weightInput.value = s.weight;

                    showToast(`Target set: ${s.reps}${weightText}`, 'info');

                    // Trigger change event for any other listeners
                    repsInput.dispatchEvent(new Event('change', { bubbles: true }));
                    if (weightInput) weightInput.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }

            list.appendChild(chip);
        });

        container.appendChild(list);
        return container;
    },

    /**
     * Set default date to today
     */
    setDefaultDate() {
        const dateInput = document.getElementById('workoutDate');
        const today = new Date();
        dateInput.value = formatDate(today);
    },

    /**
     * Update the date input container tooltip
     */
    updateDateTooltip() {
        const dateInput = document.getElementById('workoutDate');
        if (dateInput) {
            const container = dateInput.closest('.date-input-container');
            if (container) {
                container.title = `Workout Date: ${dateInput.value}`;
            }
        }
    },

    /**
     * Handle form submission
     * @param {Event} e - Submit event
     */
    async handleSubmit(e) {
        e.preventDefault();

        const exerciseId = document.getElementById('workoutExercise').value;
        const reps = document.getElementById('workoutReps').value;
        const weight = document.getElementById('workoutWeight').value;
        const date = document.getElementById('workoutDate').value;

        // Validate required fields
        if (!exerciseId || !reps || !date) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Validate date format
        if (!isValidDate(date)) {
            showToast('Invalid date format. Use YYYY-MM-DD', 'error');
            return;
        }

        // Validate reps
        const repsValidation = validateNumber(
            reps,
            CONFIG.limits.minReps,
            CONFIG.limits.maxReps,
            'Reps'
        );
        if (!repsValidation.valid) {
            showToast(repsValidation.error, 'error');
            return;
        }

        // Validate weight if provided
        if (weight) {
            const weightValidation = validateNumber(
                weight,
                CONFIG.limits.minWeight,
                CONFIG.limits.maxWeight,
                'Weight'
            );
            if (!weightValidation.valid) {
                showToast(weightValidation.error, 'error');
                return;
            }
        }

        try {
            const workout = {
                exerciseId,
                reps: repsValidation.value,
                weight: weight ? parseFloat(weight) : null,
                date
            };

            await Storage.addWorkout(workout);

            const exercise = Storage.getExerciseById(exerciseId);
            showToast(`Workout logged: ${exercise.name}`, 'success');

            // Don't reset form - keep fields for quick re-logging


            // Refresh UI and show last workout info
            this.updateWeightField();
            this.renderLastWorkoutSummary();
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    /**
     * Clear form fields except date
     */
    clearForm() {
        const muscleSelect = document.getElementById('workoutMuscle');
        if (muscleSelect) muscleSelect.value = '';

        this.populateExerciseDropdown();

        document.getElementById('workoutExercise').value = '';
        document.getElementById('workoutReps').value = '';
        document.getElementById('workoutWeight').value = '';
        // Keep date field as-is
        this.updateWeightField();
        showToast('Form cleared', 'info');
    },

    /**
     * Render a concise summary of the last workout session at the bottom
     */
    async renderLastWorkoutSummary() {
        const container = document.getElementById('lastWorkoutSummary');
        if (!container) return;

        try {
            const lastSession = await Storage.getLastWorkoutSession();

            if (!lastSession || !lastSession.exercises || lastSession.exercises.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';

            const dateObj = new Date(lastSession.date);
            const dateFormatted = dateObj.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });

            let html = `
                <div class="summary-header">
                    <span class="summary-title"><i data-lucide="history" class="icon-xs"></i> Last Workout: ${dateFormatted}</span>
                </div>
                <div class="summary-content">
                    <table class="summary-table" role="table" aria-label="Last workout exercises">
                        <thead>
                            <tr>
                                <th scope="col">Exercise</th>
                                <th scope="col">Sets</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            lastSession.exercises.forEach(ex => {
                const setChips = ex.sets.map((s, index) => {
                    const reps = s.reps ?? '-';
                    const hasWeight = s.weight !== null && s.weight !== undefined && s.weight !== '';
                    const label = hasWeight ? `${reps} × ${s.weight}` : `${reps}`;
                    return `<span class="summary-set-chip">${label}</span>`;
                }).join('');

                html += `
                    <tr class="summary-item">
                        <td class="summary-exercise">${ex.name}</td>
                        <td class="summary-sets">
                            <div class="summary-set-chips">${setChips || '<span class="summary-set-empty">-</span>'}</div>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            container.innerHTML = html;

            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (error) {
            console.error('Error rendering last workout summary:', error);
            container.style.display = 'none';
        }
    }


};


// Remove deprecated methods
// isValidDate is now imported from utils.js
// escapeHtml is now imported from utils.js
