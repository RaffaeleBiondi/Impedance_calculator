# FD second reference (optional)

Optional: needs Python 3 with numpy and scipy; not part of the build or the npm test suite.

`fd.py` is an independent uniform-grid 5-point finite-difference Laplace solver (zero-thickness strips as Dirichlet nodes, cell-centred εr, capacitance from the field energy, grounded rectangular box). `cases.py` runs the geometries whose extrapolated, box-corrected values are pinned as `FD` in `tests/helpers/validation.ts` and listed in `docs/validation.md`. Example:

    python cases.py off 2 0.2 0.1 0.3 4.4     # d = 0.01 mm
    python cases.py off 4 0.2 0.1 0.3 4.4     # d = 0.005 mm
    python cases.py off 8 0.2 0.1 0.3 4.4     # d = 0.0025 mm
    python cases.py cpwf 4 0.15 0.15 0.1 4.4 6   # box 6 mm, for the box-size correction
