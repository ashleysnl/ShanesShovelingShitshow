# SHANE'S SHOVELING SHITSHOW - Design Notes

## Score Mechanics
- Base shovel score scales with snow depth cleared (`depth * 100`).
- Combo multiplier grows aggressively (`+12%` per combo step up to a cap).
- Risk bonus (`2.2x`) applies when shoveling near the street while plow danger is active.
- Frenzy bonus (`1.5x`) applies when top driveway rows are heavily buried.
- The intended result is huge arcade numbers in longer survival runs.

## Difficulty Curve
- Passive snowfall ramps up over elapsed time.
- Plow spawn interval shrinks from roughly 7.0s to 2.6s.
- Plow speed increases over time.
- Plow snow bursts add larger snow volumes as waves progress.
- Players are pushed toward risky top-lane shoveling to keep the driveway manageable.

## Juice / Feedback
- Plow warning callouts with danger tint and audio rush.
- Screen shake, hit flash, and impact callouts on plow collisions.
- Floating score text with risk/frenzy labels.
- Combo rank callouts at streak milestones.
- Snow and spark particles from shovel actions and hazards.
- Timed pickup upgrades create short power spikes:
`The Scoop` (blue shovel burst window) and `THE HONDA` (snowblower clear sweep).
