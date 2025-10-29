# Kuramoto Model

This is a simple program used to analyze the synchronization behavior of a system of coupled oscillators based on the Kuramoto model. The synchronicity of the oscillators at any given time is measured by the order parameter.

Currently, three toplogies are implemented between oscsillators:
- All-to-All
- Neighbors by index
- Erdos-Renyi Random Graph

The program allows for the visualization of the phase diagram and order parameter in real time. 

## Methodology
- The Kuramoto model is numerically integrated using the Euler method.
    - The Euler method was chosen over RK4 due to it's computational simplicity.
- The model is simplified by precomputing the order parameter, and using the order parameter to compute the coupling term. This reduces time complexity from O(N^2) to O(N), where N is the number of oscillators.

## Limitations
- This program currently only supports up to 2000 oscillators.
- Not completely optimizied for performance; may be slow for large systems.