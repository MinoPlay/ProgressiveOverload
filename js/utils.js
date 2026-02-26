// Utility Functions
// Shared helper functions used across the application

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Generate unique ID
 * @returns {string} Unique ID based on timestamp and random string
 */
export function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse date string (YYYY-MM-DD) to Date object
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Date object or null if invalid
 */
export function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    const [year, month, day] = parts.map(n => parseInt(n, 10));

    if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1900 || year > 2100) return null;

    const date = new Date(year, month - 1, day);

    // Validate the date actually exists (e.g., not Feb 31)
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
        return null;
    }

    return date;
}

/**
 * Format Date object to YYYY-MM-DD string
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    return `${year}-${month}-${day}`;
}

/**
 * Validate date string format (YYYY-MM-DD)
 * @param {string} dateStr - Date string
 * @returns {boolean} True if valid
 */
export function isValidDate(dateStr) {
    return parseDate(dateStr) !== null;
}

/**
 * Get start of week (Monday) for a given date
 * @param {Date} date - Date object
 * @returns {Date} Start of week
 */
export function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
}

/**
 * Get the week number (ISO-8601) for a date
 * @param {Date} date - Date object
 * @returns {number} Week number (1-53)
 */
export function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Validate exercise name
 * @param {string} name - Exercise name
 * @param {number} maxLength - Maximum length allowed
 * @returns {{valid: boolean, error: string}} Validation result
 */
export function validateExerciseName(name, maxLength = 100) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Exercise name is required' };
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Exercise name cannot be empty' };
    }

    if (trimmed.length > maxLength) {
        return { valid: false, error: `Exercise name must be ${maxLength} characters or less` };
    }

    // Check for potentially dangerous characters
    if (/<|>|&lt;|&gt;/.test(trimmed)) {
        return { valid: false, error: 'Exercise name contains invalid characters' };
    }

    return { valid: true, error: '' };
}

/**
 * Validate numeric input
 * @param {string|number} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} fieldName - Name of the field (for error messages)
 * @returns {{valid: boolean, error: string, value: number}} Validation result
 */
export function validateNumber(value, min, max, fieldName) {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num)) {
        return { valid: false, error: `${fieldName} must be a valid number`, value: null };
    }

    if (num < min) {
        return { valid: false, error: `${fieldName} must be at least ${min}`, value: null };
    }

    if (num > max) {
        return { valid: false, error: `${fieldName} must be ${max} or less`, value: null };
    }

    return { valid: true, error: '', value: num };
}

/**
 * Validate equipment type
 * @param {string} type - Equipment type
 * @param {array} validTypes - Array of valid equipment types
 * @returns {{valid: boolean, error: string}} Validation result
 */
export function validateEquipmentType(type, validTypes) {
    if (!type || typeof type !== 'string') {
        return { valid: false, error: 'Equipment type is required' };
    }

    if (!validTypes.includes(type)) {
        return { valid: false, error: 'Invalid equipment type' };
    }

    return { valid: true, error: '' };
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Estimate one-rep max using Brzycki formula
 * @param {number} weight - Weight lifted
 * @param {number} reps - Repetitions performed
 * @returns {number} Estimated 1RM
 */
export function estimateOneRepMax(weight, reps) {
    if (reps === 1) return weight;
    if (reps > 36) return weight; // Formula breaks down above 36 reps
    return weight * (36 / (37 - reps));
}

/**
 * Format equipment type for display
 * @param {string} type - Equipment type
 * @returns {string} Formatted type
 */
export function formatEquipmentType(type) {
    const labels = {
        'barbell': 'Barbell',
        'dumbbell': 'Dumbbell',
        'kettlebell': 'Kettlebell',
        'machines': 'Machines',
        'bodyweight': 'Bodyweight',
        'bodyweight+': 'Bodyweight+'
    };
    return labels[type] || type;
}
