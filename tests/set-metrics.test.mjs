import test from 'node:test';
import assert from 'node:assert/strict';

import { setVolume, setTonnage } from '../js/set-metrics.js';

const weighted = { requiresWeight: true };
const bodyweight = { requiresWeight: false };

test('setVolume multiplies reps by weight for weighted exercises', () => {
    assert.equal(setVolume({ reps: 5, weight: 100 }, weighted), 500);
});

test('setVolume counts reps for bodyweight exercises', () => {
    assert.equal(setVolume({ reps: 10, weight: null }, bodyweight), 10);
    assert.equal(setVolume({ reps: 10, weight: 20 }, bodyweight), 10);
});

test('setVolume counts reps when a weighted set has no weight', () => {
    assert.equal(setVolume({ reps: 8, weight: 0 }, weighted), 8);
    assert.equal(setVolume({ reps: 8, weight: null }, weighted), 8);
});

test('setVolume counts reps when the exercise is unknown', () => {
    assert.equal(setVolume({ reps: 6, weight: 50 }, undefined), 6);
});

test('setTonnage multiplies reps by weight and treats bodyweight as zero', () => {
    assert.equal(setTonnage({ reps: 5, weight: 100 }), 500);
    assert.equal(setTonnage({ reps: 10, weight: null }), 0);
});
